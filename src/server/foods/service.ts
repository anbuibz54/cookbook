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
import { foods } from '../db/schema'
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
): Promise<Food[]> {
  const needle = normalizeForSearch(query)
  if (!needle) return []

  return db
    .select()
    .from(foods)
    .where(and(visibleTo(userId), ilike(foods.searchText, likePattern(needle))))
    // Shorter matches first: "trứng gà" should beat "bánh trứng gà nướng" for "trung ga".
    .orderBy(sql`length(${foods.searchText})`, asc(foods.nameVi))
    .limit(limit)
}

/** The foods among `ids` this user may use. Missing ids are simply absent from the map. */
export async function foodsByIds(
  db: Pick<Db, 'select'>,
  userId: string,
  ids: string[],
): Promise<Map<string, Food>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select()
    .from(foods)
    .where(and(visibleTo(userId), inArray(foods.id, ids)))
  return new Map(rows.map((f) => [f.id, f]))
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
