/**
 * The pantry: what is in the kitchen, and what that means you can cook.
 *
 * Suggestions are deliberately NOT AI work. "Which recipes can I make" is a
 * set comparison the database can answer exactly and instantly; an LLM would
 * be slower, cost money, and occasionally invent an ingredient you have. AI
 * earns its place where judgement is needed — reading a video, deciding which
 * shop stocks what — not here.
 *
 * No `next/*` imports.
 */

import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db'
import { pantryItems, recipeIngredients, recipes } from '../db/schema'
import { foodsByIds } from '../foods/service'
import { covers, matchKey } from '@/lib/match'
import { canonicalUnit, gramsFor } from '@/lib/units'

export type PantryItem = typeof pantryItems.$inferSelect

export const pantryItemInput = z.object({
  name: z.string().trim().min(1, 'Thiếu tên nguyên liệu.'),
  quantity: z.number().positive().nullish(),
  quantityMax: z.number().positive().nullish(),
  unit: z.string().trim().min(1).nullish(),
  /** ISO date, as on a label. */
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Hạn dùng phải dạng YYYY-MM-DD.').nullish(),
  note: z.string().trim().min(1).nullish(),
  foodId: z.uuid().nullish(),
})

export type PantryItemInput = z.output<typeof pantryItemInput>

/** Soonest expiry first (undated last), then alphabetical. */
export async function listPantry(db: Db, userId: string): Promise<PantryItem[]> {
  return db
    .select()
    .from(pantryItems)
    .where(eq(pantryItems.userId, userId))
    .orderBy(sql`${pantryItems.expiresOn} asc nulls last`, asc(pantryItems.name))
}

/**
 * Add or update pantry lines. One row per thing (unique on the match key), so
 * telling Claude "mua thêm trứng" twice does not leave two egg rows behind.
 */
export async function savePantryItems(
  db: Db,
  userId: string,
  items: PantryItemInput[],
): Promise<PantryItem[]> {
  if (items.length === 0) return []

  const ids = [...new Set(items.map((i) => i.foodId).filter((id): id is string => Boolean(id)))]
  const linked = await foodsByIds(db, userId, ids)

  const rows = items.map((item) => {
    const food = item.foodId ? linked.get(item.foodId) : undefined
    const resolved = gramsFor(item.quantity, item.quantityMax, item.unit, food)
    return {
      userId,
      foodId: food?.id ?? null,
      name: item.name,
      matchKey: matchKey(item.name),
      quantity: item.quantity ?? null,
      quantityMax: item.quantityMax ?? null,
      unit: canonicalUnit(item.unit),
      grams: resolved?.grams ?? null,
      expiresOn: item.expiresOn ?? null,
      note: item.note ?? null,
      updatedAt: new Date(),
    }
  })

  return db
    .insert(pantryItems)
    .values(rows)
    .onConflictDoUpdate({
      target: [pantryItems.userId, pantryItems.matchKey],
      set: {
        name: sql`excluded.name`,
        foodId: sql`excluded.food_id`,
        quantity: sql`excluded.quantity`,
        quantityMax: sql`excluded.quantity_max`,
        unit: sql`excluded.unit`,
        grams: sql`excluded.grams`,
        expiresOn: sql`excluded.expires_on`,
        note: sql`excluded.note`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning()
}

/** Remove by id, or by what the user called it ("bỏ hành lá"). */
export async function removePantryItems(
  db: Db,
  userId: string,
  { ids = [], names = [] }: { ids?: string[]; names?: string[] },
): Promise<number> {
  const keys = names.map(matchKey).filter(Boolean)
  if (ids.length === 0 && keys.length === 0) return 0

  const removed = await db
    .delete(pantryItems)
    .where(
      and(
        eq(pantryItems.userId, userId),
        or(
          ids.length > 0 ? inArray(pantryItems.id, ids) : undefined,
          keys.length > 0 ? inArray(pantryItems.matchKey, keys) : undefined,
        ),
      ),
    )
    .returning({ id: pantryItems.id })

  return removed.length
}

/* -------------------------------------------------------------------------- */
/* Suggestions                                                                 */
/* -------------------------------------------------------------------------- */

export type MissingIngredient = {
  name: string
  quantity: number | null
  unit: string | null
  grams: number | null
  foodId: string | null
  /** True when the pantry has this, but measurably less than the recipe needs. */
  short: boolean
}

export type Suggestion = {
  recipeId: string
  title: string
  tags: string[]
  totalMinutes: number | null
  have: number
  needed: number
  missing: MissingIngredient[]
  /** Pantry items about to expire that this recipe would use up. */
  usesExpiring: string[]
  updatedAt: Date
}

const EXPIRING_DAYS = 3

/**
 * Recipes ranked by how close the pantry gets you.
 *
 * Optional ingredients are ignored, and so are lines with no amount ("muối",
 * "vừa ăn") — nobody shops for salt, and counting it would make every recipe
 * look one item short.
 *
 * Ranking: fewest missing first, then recipes that use something about to go
 * off, then the most recently touched recipe.
 */
export async function suggestFromPantry(
  db: Db,
  userId: string,
  { limit = 20 }: { limit?: number } = {},
): Promise<Suggestion[]> {
  const [pantry, lines] = await Promise.all([
    listPantry(db, userId),
    db
      .select({
        recipeId: recipeIngredients.recipeId,
        name: recipeIngredients.name,
        quantity: recipeIngredients.quantity,
        unit: recipeIngredients.unit,
        grams: recipeIngredients.grams,
        optional: recipeIngredients.optional,
        foodId: recipeIngredients.foodId,
        recipe: recipes,
      })
      .from(recipeIngredients)
      .innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
      .where(eq(recipes.userId, userId)),
  ])

  if (pantry.length === 0 || lines.length === 0) return []

  // Dates compared as YYYY-MM-DD strings in Vietnam's calendar, not the
  // server's: a Vercel function runs in UTC, where "today" starts 7 hours late.
  const day = (offset: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
      new Date(Date.now() + offset * 86_400_000),
    )
  const today = day(0)
  const soon = day(EXPIRING_DAYS)

  // Past its date is not "có". Suggesting a recipe because of expired milk —
  // or praising it for using up milk that is already off — is the one way
  // this screen could do harm. It still shows in the pantry list, marked.
  const usable = pantry.filter((p) => p.expiresOn == null || p.expiresOn >= today)
  const expiringSoon = new Set(
    usable.filter((p) => p.expiresOn != null && p.expiresOn <= soon).map((p) => p.matchKey),
  )

  const byRecipe = new Map<string, Suggestion>()

  for (const line of lines) {
    if (line.optional) continue
    // "vừa ăn" lines: seasoning nobody shops for.
    if (line.quantity == null) continue

    const entry = byRecipe.get(line.recipeId) ?? {
      recipeId: line.recipeId,
      title: line.recipe.title,
      tags: line.recipe.tags,
      totalMinutes:
        line.recipe.prepMinutes == null && line.recipe.cookMinutes == null
          ? null
          : (line.recipe.prepMinutes ?? 0) + (line.recipe.cookMinutes ?? 0),
      have: 0,
      needed: 0,
      missing: [],
      usesExpiring: [],
      updatedAt: line.recipe.updatedAt,
    }
    entry.needed++

    const key = matchKey(line.name)
    const inPantry =
      usable.find((p) => p.foodId != null && p.foodId === line.foodId) ??
      usable.find((p) => covers(p.matchKey, key))

    if (!inPantry) {
      entry.missing.push({
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
        grams: line.grams,
        foodId: line.foodId,
        short: false,
      })
    } else {
      // Only call it short when both sides are weighed; otherwise "có" is the
      // honest answer and the cook can see the amounts themselves.
      const short = inPantry.grams != null && line.grams != null && inPantry.grams < line.grams
      if (short) {
        entry.missing.push({
          name: line.name,
          quantity: line.quantity,
          unit: line.unit,
          grams: line.grams != null && inPantry.grams != null ? line.grams - inPantry.grams : line.grams,
          foodId: line.foodId,
          short: true,
        })
      } else {
        entry.have++
      }
      if (expiringSoon.has(inPantry.matchKey) && !entry.usesExpiring.includes(inPantry.name)) {
        entry.usesExpiring.push(inPantry.name)
      }
    }

    byRecipe.set(line.recipeId, entry)
  }

  return [...byRecipe.values()]
    .filter((s) => s.have > 0)
    .sort(
      (a, b) =>
        a.missing.length - b.missing.length ||
        b.usesExpiring.length - a.usesExpiring.length ||
        b.updatedAt.getTime() - a.updatedAt.getTime(),
    )
    .slice(0, limit)
}


/* -------------------------------------------------------------------------- */
/* Editing by hand                                                             */
/* -------------------------------------------------------------------------- */

export type PantryEdit = {
  quantity: number | null
  unit: string | null
  /** YYYY-MM-DD or null to clear. */
  expiresOn: string | null
  note: string | null
}

/** Change what the pantry says about one item. Grams are recomputed from the linked food. */
export async function updatePantryItem(db: Db, userId: string, itemId: string, edit: PantryEdit): Promise<boolean> {
  const [item] = await db
    .select()
    .from(pantryItems)
    .where(and(eq(pantryItems.id, itemId), eq(pantryItems.userId, userId)))
  if (!item) return false

  const linked = item.foodId ? await foodsByIds(db, userId, [item.foodId]) : new Map()
  const grams = gramsFor(edit.quantity, null, edit.unit, item.foodId ? linked.get(item.foodId) : undefined)
  await db
    .update(pantryItems)
    .set({
      quantity: edit.quantity,
      quantityMax: null,
      unit: canonicalUnit(edit.unit),
      grams: grams?.grams ?? null,
      expiresOn: edit.expiresOn,
      note: edit.note,
      updatedAt: new Date(),
    })
    .where(eq(pantryItems.id, item.id))
  return true
}
