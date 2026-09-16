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
  date,
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
 *  - portion    a measured portion weight from the food's data ("1 large egg
 *               = 50 g") — good for volume, typical-size for counts
 *  - estimate   someone said "1 củ hành ≈ 80 g" — approximate
 *
 * `portion` was added after `estimate`; Postgres enums order by creation, so
 * never sort on this column expecting best-first.
 */
export const gramsSourceEnum = cookbook.enum('grams_source', ['mass', 'volume', 'estimate', 'portion'])

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
  /**
   * False when `nameVi` was machine-translated (the USDA import's Vietnamese
   * names are). The nutrient numbers are unaffected — only the label is
   * unconfirmed. Flip to true once a person has looked at it.
   */
  nameViReviewed: boolean('name_vi_reviewed').notNull().default(false),
  nameEn: text('name_en'),
  aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
  searchText: text('search_text').notNull(),
  /** The source dataset's grouping, e.g. USDA "Vegetables and Vegetable Products". */
  category: text('category'),

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

/**
 * Measured weights of household portions for one food: "1 large" = 50 g for an
 * egg, "1 clove" = 3 g for garlic, "1 cup" = 125 g for flour.
 *
 * This is what turns "2 quả trứng" or "3 tép tỏi" into grams without anyone
 * guessing. `unit` is a normalised key (see `portionKey` in src/lib/units.ts):
 * volume units (`cup`, `tbsp`, `tsp`, `ml`) or count words (`large`, `medium`,
 * `clove`, `slice`, `leaf`…). `label` keeps the dataset's original wording.
 * `grams` is per ONE unit.
 */
export const foodPortions = cookbook.table('food_portions', {
  id: uuid('id').primaryKey().defaultRandom(),
  foodId: uuid('food_id').notNull().references(() => foods.id, { onDelete: 'cascade' }),
  unit: text('unit').notNull(),
  label: text('label').notNull(),
  grams: real('grams').notNull(),
}, (t) => [
  index('food_portions_food_idx').on(t.foodId, t.unit),
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
/* Pantry — what is in the kitchen right now                                   */
/* -------------------------------------------------------------------------- */

/**
 * One thing in the fridge or cupboard.
 *
 * `foodId` is what makes matching against a recipe reliable; `name` is what
 * the user said. Unlinked rows still work — matching falls back to the
 * normalised name (see src/lib/match.ts).
 *
 * `quantity`/`unit` are what the user gave ("nửa bó hành"); `grams` is the
 * resolved weight where the unit allows it, which is the only form two
 * different wordings can be compared in. All three may be null: "còn hành lá"
 * is a legitimate pantry entry and still answers "nấu được món này không".
 *
 * `expiresOn` is a date, not a timestamp — nobody knows the hour their rau
 * goes off, and a date is what a label carries.
 */
export const pantryItems = cookbook.table('pantry_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  /** Normalised `name`, so pantry ↔ ingredient matching is one comparison. */
  matchKey: text('match_key').notNull(),
  quantity: real('quantity'),
  quantityMax: real('quantity_max'),
  unit: text('unit'),
  grams: real('grams'),
  expiresOn: date('expires_on'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // One row per thing: adding "trứng gà" twice updates, never duplicates.
  uniqueIndex('pantry_user_key_idx').on(t.userId, t.matchKey),
  index('pantry_user_expiry_idx').on(t.userId, t.expiresOn),
  index('pantry_food_id_idx').on(t.foodId),
])

/* -------------------------------------------------------------------------- */
/* Shopping                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Where something is bought. The four kinds are fixed so the list groups the
 * same way every week; the branch itself (name, address, map link) is whatever
 * Claude found for the user's area.
 */
export const storeKindEnum = cookbook.enum('store_kind', ['bhx', 'cho', 'sieu_thi', 'online'])

export const stores = cookbook.table('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: storeKindEnum('kind').notNull(),
  /** Branch name as people say it: "Bách Hóa Xanh Nguyễn Thị Thập", "chợ Tân Mỹ". */
  name: text('name').notNull(),
  address: text('address'),
  /** Google Maps link, found by Claude. Shown as a button, never auto-opened. */
  mapsUrl: text('maps_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('stores_user_name_idx').on(t.userId, t.kind, t.name),
  index('stores_user_idx').on(t.userId),
])

/**
 * A line on the shopping list. Created from what a recipe needs and the pantry
 * lacks, or by hand.
 *
 * `storeId` is null until something classifies it — the list is useful
 * unsorted, and sorting it is Claude's job (it needs web search to know what
 * Bách Hóa Xanh actually stocks).
 *
 * `boughtAt` is a soft tick rather than a delete, so a list can be reviewed
 * after the trip; `recipeId` records why the line is there.
 */
export const shoppingItems = cookbook.table('shopping_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),
  recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  matchKey: text('match_key').notNull(),
  quantity: real('quantity'),
  unit: text('unit'),
  grams: real('grams'),
  note: text('note'),
  boughtAt: timestamp('bought_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // The open list is what the screen reads; bought rows drop out of this index.
  index('shopping_user_open_idx').on(t.userId, t.createdAt).where(sql`${t.boughtAt} is null`),
  index('shopping_user_store_idx').on(t.userId, t.storeId),
  index('shopping_recipe_idx').on(t.recipeId),
  index('shopping_food_id_idx').on(t.foodId),
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

/* -------------------------------------------------------------------------- */
/* Journal — what was actually cooked                                          */
/* -------------------------------------------------------------------------- */

/**
 * One meal the user cooked: a photo, what it was, a note. The daily log that
 * streaks and goals are counted from, and the place the pantry learns what was
 * used.
 *
 * `cookedOn` is a date in Vietnam's calendar, not a timestamp — "hôm qua nấu gì"
 * is a question about days, and logging dinner at 00:30 still belongs to the
 * evening before if the user says so.
 *
 * `photoPath` is a key in the private `cookbook-photos` Storage bucket
 * (`<userId>/journal/<file>`). Files are never overwritten — a new photo is a
 * new path — so the image route can cache them forever.
 */
export const journalEntries = cookbook.table('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  cookedOn: date('cooked_on').notNull(),
  /** What the user called the meal, "canh chua cá lóc, cơm trắng". */
  title: text('title').notNull(),
  note: text('note'),
  photoPath: text('photo_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('journal_user_day_idx').on(t.userId, t.cookedOn, t.createdAt),
])

/**
 * The dishes in one meal. `recipeId` set = cooked from the sổ; null = a dish
 * without a recipe ("cơm trắng"). Kept per dish rather than as one text field
 * because "món mới" (first time a dish is cooked) is counted from here.
 */
export const journalDishes = cookbook.table('journal_dishes', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryId: uuid('entry_id').notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
  position: smallint('position').notNull(),
  recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  /** Normalised `name`, for "have I cooked this before" without a recipe. */
  matchKey: text('match_key').notNull(),
}, (t) => [
  index('journal_dishes_entry_idx').on(t.entryId, t.position),
  index('journal_dishes_recipe_idx').on(t.recipeId),
])

/**
 *  - used    taken from the pantry
 *  - bought  bought for this meal (not tracked in the pantry)
 */
export const journalItemKindEnum = cookbook.enum('journal_item_kind', ['used', 'bought'])

/**
 * What went into a meal, as the user confirmed it. A record, not a live link:
 * the pantry row it came from may be gone by tomorrow, so the name and amount
 * are copied here.
 */
export const journalItems = cookbook.table('journal_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryId: uuid('entry_id').notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
  kind: journalItemKindEnum('kind').notNull(),
  position: smallint('position').notNull(),
  name: text('name').notNull(),
  matchKey: text('match_key').notNull(),
  quantity: real('quantity'),
  unit: text('unit'),
  /** True when the user said the whole pantry item went ("hết"). */
  usedAll: boolean('used_all').notNull().default(false),
  foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),
}, (t) => [
  index('journal_items_entry_idx').on(t.entryId, t.kind, t.position),
  index('journal_items_food_id_idx').on(t.foodId),
])
