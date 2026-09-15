/**
 * Cookbook — v0.1 schema.
 *
 * Everything lives in the `cookbook` Postgres schema. The database is shared
 * with LifeOS (`public`) and the bakery app (`bakery`), so nothing here may be
 * declared with bare `pgTable`/`pgEnum` — those land in `public`, where LifeOS
 * already has enums named `authored_by` and `source_channel`.
 *
 * Rules (same as LifeOS):
 *  - Every foreign key gets an index.
 *  - Migrations only go forward.
 *  - Nothing here imports from `next/*`.
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const cookbook = pgSchema('cookbook')

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

/** Where a write came from. Measures whether MCP capture is actually used. */
export const sourceChannelEnum = cookbook.enum('source_channel', ['web', 'mcp'])

/** Who wrote it. A recipe an AI extracted from a video is `ai` until edited. */
export const authoredByEnum = cookbook.enum('authored_by', ['human', 'ai'])

/**
 * How trustworthy a food's nutrient numbers are, best first. Shown next to
 * every nutrition figure — "clear nutrition" means being honest about which
 * numbers are lab data and which are a model's guess.
 *
 *  - usda         USDA FoodData Central (lab data, public domain)
 *  - vn_fct       Bảng thành phần thực phẩm Việt Nam (Viện Dinh dưỡng)
 *  - label        read off a product's nutrition label
 *  - ai_estimate  an AI's best guess; replace when better data exists
 */
export const foodSourceEnum = cookbook.enum('food_source', ['usda', 'vn_fct', 'label', 'ai_estimate'])

/**
 * How an ingredient's gram weight was obtained.
 *
 *  - mass       quantity was already in g/kg/mg — exact
 *  - volume     ml/tsp/cup × the food's density — good
 *  - estimate   someone said "1 củ hành ≈ 80 g" — approximate
 */
export const gramsSourceEnum = cookbook.enum('grams_source', ['mass', 'volume', 'estimate'])

/* -------------------------------------------------------------------------- */
/* Users                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors `auth.users` (shared with LifeOS — same login). Own table rather than
 * reusing `public.users`, so the cookbook does not depend on LifeOS's schema.
 * Provisioned on first authenticated request; no trigger in `auth`.
 */
export const users = cookbook.table('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_email_idx').on(t.email),
])

/* -------------------------------------------------------------------------- */
/* Foods — the nutrition reference                                             */
/* -------------------------------------------------------------------------- */

/**
 * One food, nutrients per 100 g of the edible part.
 *
 * `userId` null = shared reference data (USDA / Vietnamese table imports).
 * `userId` set  = a food someone added (from a label, or an AI estimate).
 *
 * Only the handful of nutrients people read on a recipe card are columns;
 * anything else an import carries goes in `extra` rather than into a migration.
 *
 * `searchText` is the Vietnamese and English names plus aliases, lowercased
 * with diacritics stripped (see src/lib/text.ts), so "nuoc mam" finds "nước
 * mắm". Done in app code instead of the `unaccent` extension so this schema
 * never needs to install anything into a database it shares.
 */
export const foods = cookbook.table('foods', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  source: foodSourceEnum('source').notNull(),
  /** The id in the source dataset (FDC id, VN table code). Null for label / AI. */
  sourceRef: text('source_ref'),
  nameVi: text('name_vi'),
  nameEn: text('name_en'),
  aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
  searchText: text('search_text').notNull(),

  kcal: real('kcal').notNull(),
  proteinG: real('protein_g').notNull(),
  fatG: real('fat_g').notNull(),
  carbsG: real('carbs_g').notNull(),
  fiberG: real('fiber_g'),
  sugarG: real('sugar_g'),
  sodiumMg: real('sodium_mg'),
  extra: jsonb('extra').notNull().default(sql`'{}'::jsonb`),

  /** g per ml. Lets "2 muỗng canh nước mắm" become grams. Null = unknown. */
  densityGPerMl: real('density_g_per_ml'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('foods_user_id_idx').on(t.userId),
  // One row per source record, so re-running an import is an upsert.
  uniqueIndex('foods_source_ref_idx').on(t.source, t.sourceRef),
])

/* -------------------------------------------------------------------------- */
/* Recipes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The recipe header. Ingredients and steps are child rows so they can be
 * ordered, grouped into sections ("Nước dùng", "Topping"), and linked to foods.
 *
 * `servings` is a number, not text, because scaling divides by it. What one
 * serving *is* goes in `yieldLabel` ("phần", "ổ 20 cm", "cái").
 *
 * No total-time column: prep + cook, derived.
 */
export const recipes = cookbook.table('recipes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  summary: text('summary'),
  servings: real('servings').notNull().default(1),
  yieldLabel: text('yield_label'),
  prepMinutes: integer('prep_minutes'),
  cookMinutes: integer('cook_minutes'),
  cuisine: text('cuisine'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  /** Tips, storage, what went wrong last time. Markdown. */
  notes: text('notes'),
  sourceUrl: text('source_url'),
  /** Who to credit — "Mẹ", "@channel on YouTube". */
  sourceLabel: text('source_label'),
  sourceChannel: sourceChannelEnum('source_channel').notNull().default('web'),
  authoredBy: authoredByEnum('authored_by').notNull().default('human'),
  /** Title, tags, cuisine and ingredient names, normalised. Rewritten on every save. */
  searchText: text('search_text').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('recipes_user_updated_idx').on(t.userId, t.updatedAt),
])

/**
 * One ingredient line.
 *
 * `name` is what the cook reads ("hành tím, băm"). `foodId` is what nutrition
 * reads — nullable, because an unlinked ingredient is normal and just shows up
 * as a gap in coverage rather than blocking the save.
 *
 * `quantity` null = "vừa ăn" / to taste; such lines never scale.
 * `quantityMax` set = a range, "2–3 quả".
 * `grams` is the weight of *this line as written*, for nutrition only.
 */
export const recipeIngredients = cookbook.table('recipe_ingredients', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  position: smallint('position').notNull(),
  section: text('section'),
  name: text('name').notNull(),
  quantity: real('quantity'),
  quantityMax: real('quantity_max'),
  unit: text('unit'),
  note: text('note'),
  optional: boolean('optional').notNull().default(false),
  foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),
  grams: real('grams'),
  gramsSource: gramsSourceEnum('grams_source'),
}, (t) => [
  index('recipe_ingredients_recipe_idx').on(t.recipeId, t.position),
  index('recipe_ingredients_food_id_idx').on(t.foodId),
])

export const recipeSteps = cookbook.table('recipe_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  position: smallint('position').notNull(),
  section: text('section'),
  body: text('body').notNull(),
  /** Drives a one-tap timer in cook mode. */
  timerSeconds: integer('timer_seconds'),
}, (t) => [
  index('recipe_steps_recipe_idx').on(t.recipeId, t.position),
])

/**
 * Append-only history. Before every update the *previous* full recipe is
 * snapshotted here, with a note on what changed ("bớt đường 20%").
 *
 * A snapshot (jsonb) rather than versioned child rows: history is read rarely
 * and always whole, and a snapshot survives future schema changes without a
 * migration of old versions.
 */
export const recipeVersions = cookbook.table('recipe_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  snapshot: jsonb('snapshot').notNull(),
  changeNote: text('change_note'),
  sourceChannel: sourceChannelEnum('source_channel').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('recipe_versions_recipe_idx').on(t.recipeId, t.createdAt),
])

/* -------------------------------------------------------------------------- */
/* MCP tokens                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Bearer tokens for /api/mcp. Same design as LifeOS: only the SHA-256 hash is
 * stored, the plaintext is shown once, revocation is a soft delete.
 */
export const mcpTokens = cookbook.table('mcp_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('mcp_tokens_hash_idx').on(t.tokenHash),
  index('mcp_tokens_user_idx').on(t.userId, t.createdAt),
])
