/**
 * Foods: the nutrition reference ingredients link to.
 *
 * Visibility is "shared reference rows + my own rows". A user can never read
 * or link another user's custom food.
 *
 * No `next/*` imports.
 */

import { and, asc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db'
import { foodPortions, foods, recipeIngredients, recipes } from '../db/schema'
import { normalizeForSearch } from '@/lib/text'

export type Food = typeof foods.$inferSelect

function visibleTo(userId: string) {
  return or(isNull(foods.userId), eq(foods.userId, userId))
}

/** `%` and `_` are wildcards in ILIKE; a search for "50%" should mean the text. */
export function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export async function searchFoods(
  db: Db,
  userId: string,
  { query, limit = 10 }: { query: string; limit?: number },
): Promise<FoodWithPortions[]> {
  const needle = normalizeForSearch(query)
  if (!needle) return []

  // Every word must appear, in any order: "egg raw" finds "Egg, whole, raw, fresh".
  const words = needle.split(' ').filter(Boolean)
  const escaped = needle.replace(/[\\%_]/g, (c) => `\\${c}`)
  // `\M` is Postgres regex for end-of-word: "egg" matches "egg, whole" but not "eggnog".
  const wordPrefix = `^${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\M`

  const rows = await db
    .select()
    .from(foods)
    .where(and(visibleTo(userId), ...words.map((w) => ilike(foods.searchText, likePattern(w)))))
    .orderBy(
      // The user's own foods first.
      sql`(${foods.userId} is null)`,
      // The name itself starts with the query as whole words. `searchText`
      // starts with the Vietnamese name, so "bo lat" → "bơ lạt", not "gelatin"
      // (which only happens to contain "bo" and "lat"); the English name
      // covers "egg" → "Egg, whole, raw" before "Eggnog".
      sql`(${foods.searchText} ~ ${wordPrefix} or lower(coalesce(${foods.nameEn}, '')) ~ ${wordPrefix}) desc`,
      // Then the phrase as whole words anywhere, before scattered words.
      sql`((' ' || ${foods.searchText}) like ${`% ${escaped}%`}) desc`,
      // Among equally good name matches, a food that can turn "3 quả" or
      // "1 muỗng" into grams beats one that cannot: the Vietnamese table's
      // trứng gà has no portion weights, USDA's does, and picking the first
      // hit should not silently leave a recipe line unweighed.
      // Raw SQL with an explicit alias: a drizzle column reference inside
      // this subquery renders unqualified and binds to the wrong table.
      sql.raw(
        `(exists (select 1 from "cookbook"."food_portions" fp where fp.food_id = "foods"."id") or "foods"."density_g_per_ml" is not null) desc`,
      ),
      // Curated foods (with a Vietnamese name) before the long tail, then
      // shorter text: "trứng gà" before "bánh trứng gà nướng".
      sql`(${foods.nameVi} is null)`,
      sql`length(${foods.searchText})`,
      asc(foods.nameEn),
    )
    .limit(limit)

  const portions = await portionsFor(db, rows.map((f) => f.id))
  return rows.map((f) => ({ ...f, portions: portions.get(f.id) ?? [] }))
}

export type Portion = typeof foodPortions.$inferSelect
export type FoodWithPortions = Food & { portions: Portion[] }

/** The foods among `ids` this user may use, with portions. Missing ids are absent from the map. */
export async function foodsByIds(
  db: Pick<Db, 'select'>,
  userId: string,
  ids: string[],
): Promise<Map<string, FoodWithPortions>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select()
    .from(foods)
    .where(and(visibleTo(userId), inArray(foods.id, ids)))
  const portions = await portionsFor(db, rows.map((f) => f.id))
  return new Map(rows.map((f) => [f.id, { ...f, portions: portions.get(f.id) ?? [] }]))
}

export async function portionsFor(db: Pick<Db, 'select'>, foodIds: string[]): Promise<Map<string, Portion[]>> {
  const map = new Map<string, Portion[]>()
  if (foodIds.length === 0) return map
  const rows = await db.select().from(foodPortions).where(inArray(foodPortions.foodId, foodIds))
  for (const p of rows) {
    const list = map.get(p.foodId)
    if (list) list.push(p)
    else map.set(p.foodId, [p])
  }
  return map
}

export const createFoodInput = z
  .object({
    nameVi: z.string().trim().min(1).nullish(),
    nameEn: z.string().trim().min(1).nullish(),
    aliases: z.array(z.string().trim().min(1)).max(20).default([]),
    source: z.enum(['label', 'ai_estimate']),
    kcal: z.number().min(0).max(900),
    proteinG: z.number().min(0).max(100),
    fatG: z.number().min(0).max(100),
    carbsG: z.number().min(0).max(100),
    fiberG: z.number().min(0).max(100).nullish(),
    sugarG: z.number().min(0).max(100).nullish(),
    sodiumMg: z.number().min(0).max(40000).nullish(),
    densityGPerMl: z.number().positive().max(3).nullish(),
  })
  .refine((f) => f.nameVi || f.nameEn, { message: 'A food needs a Vietnamese or English name.' })
  .refine((f) => f.proteinG + f.fatG + f.carbsG <= 100.5, {
    message: 'Protein + fat + carbs cannot exceed 100 g per 100 g.',
  })

export type CreateFoodInput = z.input<typeof createFoodInput>

export async function createFood(db: Db, userId: string, input: z.output<typeof createFoodInput>): Promise<Food> {
  const [row] = await db
    .insert(foods)
    .values({
      userId,
      source: input.source,
      nameVi: input.nameVi ?? null,
      // Chosen for this food on purpose, not machine-translated from a dataset.
      nameViReviewed: input.nameVi != null,
      nameEn: input.nameEn ?? null,
      aliases: input.aliases,
      searchText: normalizeForSearch(input.nameVi, input.nameEn, ...input.aliases),
      kcal: input.kcal,
      proteinG: input.proteinG,
      fatG: input.fatG,
      carbsG: input.carbsG,
      fiberG: input.fiberG ?? null,
      sugarG: input.sugarG ?? null,
      sodiumMg: input.sodiumMg ?? null,
      densityGPerMl: input.densityGPerMl ?? null,
    })
    .returning()
  return row
}

export function foodLabel(f: Pick<Food, 'nameVi' | 'nameEn'>): string {
  if (f.nameVi && f.nameEn) return `${f.nameVi} (${f.nameEn})`
  return f.nameVi ?? f.nameEn ?? 'Không tên'
}

/**
 * The food a typed name unambiguously means, or null. For hand-entered
 * pantry and shopping lines, where nobody picks from a search list: only an
 * exact Vietnamese name or alias counts, so "hành" never quietly becomes
 * "hành tây". The link only adds grams; a missing link loses nothing else.
 */
export async function exactFood(db: Db, userId: string, name: string): Promise<FoodWithPortions | null> {
  const key = normalizeForSearch(name)
  if (!key) return null
  const hits = await searchFoods(db, userId, { query: name, limit: 5 })
  return (
    hits.find(
      (f) => normalizeForSearch(f.nameVi) === key || f.aliases.some((a) => normalizeForSearch(a) === key),
    ) ?? null
  )
}

export type NameSuggestion = {
  name: string
  foodId: string | null
  /** Recipes that use this name, so the cook sees it will match them. */
  recipes: string[]
}

/**
 * Names to offer while typing a pantry or shopping item: first the names the
 * user's own recipes use (typing one of those is what makes "nấu được gì"
 * work), then foods from the nutrition data with a Vietnamese name.
 */
export async function suggestIngredientNames(db: Db, userId: string, query: string, limit = 8): Promise<NameSuggestion[]> {
  const needle = normalizeForSearch(query)
  if (!needle) return []
  const words = needle.split(' ')
  // Every typed word must start a word of the Vietnamese name: "sa" finds "sả"
  // and "sữa", not "muối" through its English name "Salt".
  const fits = (name: string) => {
    const parts = normalizeForSearch(name).split(' ')
    return words.every((w) => parts.some((p) => p.startsWith(w)))
  }

  const lines = await db
    .select({ name: recipeIngredients.name, foodId: recipeIngredients.foodId, title: recipes.title })
    .from(recipeIngredients)
    .innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
    .where(eq(recipes.userId, userId))

  const byName = new Map<string, NameSuggestion & { starts: boolean }>()
  for (const line of lines) {
    const key = normalizeForSearch(line.name)
    if (!fits(line.name)) continue
    const entry = byName.get(key) ?? { name: line.name, foodId: line.foodId, recipes: [], starts: key.startsWith(needle) }
    if (!entry.recipes.includes(line.title)) entry.recipes.push(line.title)
    entry.foodId ??= line.foodId
    byName.set(key, entry)
  }
  const fromRecipes = [...byName.values()]
    .sort((a, b) => Number(b.starts) - Number(a.starts) || b.recipes.length - a.recipes.length || a.name.length - b.name.length)
    .map((entry) => ({ name: entry.name, foodId: entry.foodId, recipes: entry.recipes }))

  const foodsHit = await searchFoods(db, userId, { query, limit: limit * 4 })
  const fromFoods = foodsHit
    .filter((f) => f.nameVi && fits(f.nameVi) && !byName.has(normalizeForSearch(f.nameVi)))
    .map((f) => ({ name: f.nameVi!, foodId: f.id, recipes: [] }))

  const seen = new Set<string>()
  return [...fromRecipes, ...fromFoods]
    .filter((s) => {
      const key = normalizeForSearch(s.name)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}
