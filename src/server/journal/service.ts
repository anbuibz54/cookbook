/**
 * The cooking journal: what was cooked, with what, and what that took out of
 * the kitchen.
 *
 * Logging a meal is the moment the pantry learns the truth, so the flow is
 * built around confirmation, not automation: the app PROPOSES what was used
 * (recipe × pantry, exact arithmetic, no AI) and the user ticks and corrects.
 * Nothing leaves the pantry that the user did not see.
 *
 * No `next/*` imports.
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db'
import {
  journalDishes,
  journalEntries,
  journalItems,
  pantryItems,
  recipeIngredients,
  recipes,
  shoppingItems,
} from '../db/schema'
import { foodsByIds } from '../foods/service'
import { checkinForMeal, conquerWishes } from '../motivation/service'
import { formatAmount, parseAmount } from '@/lib/amount'
import { vnDate, weekStart } from '@/lib/dates'
import { covers, matchKey } from '@/lib/match'
import { canonicalUnit, gramsFor } from '@/lib/units'

export type JournalEntry = typeof journalEntries.$inferSelect
export type JournalDish = typeof journalDishes.$inferSelect
export type JournalItem = typeof journalItems.$inferSelect

/* -------------------------------------------------------------------------- */
/* Proposal                                                                    */
/* -------------------------------------------------------------------------- */

export type ProposedUse = {
  pantryItemId: string
  name: string
  /** What the pantry says is there, for the "tủ còn 600 g" hint. */
  have: string
  /** Prefilled amount box. Empty when the recipe says "vừa ăn". */
  amount: string
  forDish: string
  /** Seasoning with no amount starts unticked — ticking it would empty the salt jar. */
  ticked: boolean
}

export type ProposedBuy = {
  name: string
  amount: string
  forDish: string
}

/**
 * What cooking these recipes probably used from the pantry, and what had to be
 * bought.
 *
 * The same matching as the pantry suggestions (food link first, then the
 * prefix-only name rule), and the same honesty rules: expired items are not
 * "in the fridge", and optional lines are left out.
 */
export async function proposeMeal(
  db: Db,
  userId: string,
  recipeIds: string[],
): Promise<{ used: ProposedUse[]; bought: ProposedBuy[] }> {
  if (recipeIds.length === 0) return { used: [], bought: [] }

  const today = vnDate()
  const [pantry, lines] = await Promise.all([
    db.select().from(pantryItems).where(eq(pantryItems.userId, userId)),
    db
      .select({
        recipeId: recipeIngredients.recipeId,
        title: recipes.title,
        name: recipeIngredients.name,
        quantity: recipeIngredients.quantity,
        unit: recipeIngredients.unit,
        optional: recipeIngredients.optional,
        foodId: recipeIngredients.foodId,
      })
      .from(recipeIngredients)
      .innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
      .where(and(eq(recipes.userId, userId), inArray(recipes.id, recipeIds)))
      .orderBy(recipeIngredients.recipeId, recipeIngredients.position),
  ])

  const usable = pantry.filter((p) => p.expiresOn == null || p.expiresOn >= today)
  const used: ProposedUse[] = []
  const bought: ProposedBuy[] = []

  for (const line of lines) {
    if (line.optional) continue
    const key = matchKey(line.name)
    const item =
      usable.find((p) => p.foodId != null && p.foodId === line.foodId) ??
      usable.find((p) => covers(p.matchKey, key))
    const amount = formatAmount(line.quantity, line.unit)

    if (item) {
      const existing = used.find((u) => u.pantryItemId === item.id)
      if (existing) {
        // Two dishes, one pantry item: add when the units agree, otherwise the
        // first amount stands and the cook corrects it.
        const a = parseAmount(existing.amount)
        const b = parseAmount(amount)
        if (a.kind === 'measured' && b.kind === 'measured' && a.unit === b.unit) {
          existing.amount = formatAmount(a.quantity + b.quantity, a.unit)
        } else if (!existing.amount) {
          existing.amount = amount
        }
        existing.ticked ||= line.quantity != null
        if (!existing.forDish.includes(line.title)) existing.forDish += `, ${line.title}`
        continue
      }
      used.push({
        pantryItemId: item.id,
        name: item.name,
        have: item.quantity != null ? formatAmount(item.quantity, item.unit) : '',
        amount,
        forDish: line.title,
        ticked: line.quantity != null,
      })
    } else if (line.quantity != null) {
      // "vừa ăn" lines that are not in the pantry are seasoning nobody bought.
      if (bought.some((b) => matchKey(b.name) === key)) continue
      bought.push({ name: line.name, amount, forDish: line.title })
    }
  }

  return { used, bought }
}

/* -------------------------------------------------------------------------- */
/* Saving                                                                      */
/* -------------------------------------------------------------------------- */

export const mealInput = z.object({
  cookedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD.'),
  dishes: z
    .array(z.object({ recipeId: z.uuid().nullish(), name: z.string().trim().min(1) }))
    .min(1, 'Nấu món gì vậy? Thêm ít nhất một món.')
    .max(10),
  note: z.string().trim().max(2000).nullish(),
  used: z.array(z.object({ pantryItemId: z.uuid(), amount: z.string().max(40) })).max(60),
  bought: z.array(z.object({ name: z.string().trim().min(1).max(80), amount: z.string().max(40) })).max(60),
  /** `tick` streaks the user ticked for this meal. */
  streakIds: z.array(z.uuid()).max(20).optional(),
})

export type MealInput = z.output<typeof mealInput>

export type PantryChange = {
  /** Weighed or counted, something left. */
  reduced: string[]
  /** Used up (or "hết"). */
  removed: string[]
  /** Units that cannot be compared ("1 bó" against "200 g"): left untouched. */
  unchanged: string[]
}

/**
 * Save a meal and apply it to the kitchen, in one transaction: the entry, its
 * dishes and items, the pantry deductions, ticking matching lines on the
 * shopping list, ticked streaks, and wishes this meal conquers. Either all of it happens or none.
 */
export async function createMeal(
  db: Db,
  userId: string,
  input: MealInput,
  photoPath: string | null,
): Promise<{ entryId: string; pantry: PantryChange; conquered: string[] }> {
  // Recipe ids from the form are only trusted after checking they are the user's.
  const recipeIds = [...new Set(input.dishes.map((d) => d.recipeId).filter((id): id is string => Boolean(id)))]
  const owned = recipeIds.length
    ? new Set(
        (
          await db
            .select({ id: recipes.id })
            .from(recipes)
            .where(and(eq(recipes.userId, userId), inArray(recipes.id, recipeIds)))
        ).map((r) => r.id),
      )
    : new Set<string>()

  const pantryIds = [...new Set(input.used.map((u) => u.pantryItemId))]
  const pantry = pantryIds.length
    ? await db
        .select()
        .from(pantryItems)
        .where(and(eq(pantryItems.userId, userId), inArray(pantryItems.id, pantryIds)))
    : []
  const byId = new Map(pantry.map((p) => [p.id, p]))
  const foods = await foodsByIds(
    db,
    userId,
    pantry.map((p) => p.foodId).filter((id): id is string => Boolean(id)),
  )

  const change: PantryChange = { reduced: [], removed: [], unchanged: [] }

  let conquered: string[] = []
  const entryId = await db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(journalEntries)
      .values({
        userId,
        cookedOn: input.cookedOn,
        title: input.dishes.map((d) => d.name).join(', '),
        note: input.note || null,
        photoPath,
      })
      .returning({ id: journalEntries.id })

    await tx.insert(journalDishes).values(
      input.dishes.map((d, i) => ({
        entryId: entry.id,
        position: i,
        recipeId: d.recipeId && owned.has(d.recipeId) ? d.recipeId : null,
        name: d.name,
        matchKey: matchKey(d.name),
      })),
    )

    await checkinForMeal(tx, userId, entry.id, input.cookedOn, input.streakIds ?? [])
    conquered = await conquerWishes(tx, userId, entry.id, input.dishes.map((d) => ({
      recipeId: d.recipeId && owned.has(d.recipeId) ? d.recipeId : null,
      name: d.name,
    })))

    const itemRows: (typeof journalItems.$inferInsert)[] = []

    for (const use of input.used) {
      const item = byId.get(use.pantryItemId)
      if (!item) continue
      const amount = parseAmount(use.amount)
      itemRows.push({
        entryId: entry.id,
        kind: 'used',
        position: itemRows.length,
        name: item.name,
        matchKey: item.matchKey,
        quantity: amount.kind === 'measured' ? amount.quantity : null,
        unit: amount.kind === 'measured' ? amount.unit : null,
        usedAll: amount.kind === 'all',
        foodId: item.foodId,
      })

      // How much is left, in whichever terms both sides share.
      let left: { grams: number | null; quantity: number | null } | null = null
      if (amount.kind === 'all') {
        left = { grams: 0, quantity: 0 }
      } else if (amount.kind === 'measured') {
        const food = item.foodId ? foods.get(item.foodId) : undefined
        const usedGrams = gramsFor(amount.quantity, null, amount.unit, food)?.grams ?? null
        if (item.grams != null && usedGrams != null) {
          const grams = item.grams - usedGrams
          const ratio = item.grams > 0 ? Math.max(grams, 0) / item.grams : 0
          left = { grams, quantity: item.quantity != null ? item.quantity * ratio : null }
        } else if (item.quantity != null && canonicalUnit(amount.unit) === item.unit) {
          const quantity = item.quantity - amount.quantity
          const ratio = item.quantity > 0 ? Math.max(quantity, 0) / item.quantity : 0
          left = { grams: item.grams != null ? item.grams * ratio : null, quantity }
        }
      }

      if (!left) {
        // "còn nước mắm" has no amount to subtract from — nothing to report.
        // Only a real mismatch ("1 bó" in the fridge, "2 cây" used) is worth a word.
        const tracked = item.quantity != null || item.grams != null
        if (amount.kind !== 'none' && tracked) change.unchanged.push(item.name)
        continue
      }
      const gone = (left.grams != null && left.grams <= 0.5) || (left.quantity != null && left.quantity <= 0.001)
      if (gone) {
        await tx.delete(pantryItems).where(eq(pantryItems.id, item.id))
        change.removed.push(item.name)
      } else {
        await tx
          .update(pantryItems)
          .set({ grams: left.grams, quantity: left.quantity, quantityMax: null, updatedAt: new Date() })
          .where(eq(pantryItems.id, item.id))
        change.reduced.push(item.name)
      }
    }

    const boughtKeys: string[] = []
    for (const buy of input.bought) {
      const amount = parseAmount(buy.amount)
      const key = matchKey(buy.name)
      boughtKeys.push(key)
      itemRows.push({
        entryId: entry.id,
        kind: 'bought',
        position: itemRows.length,
        name: buy.name,
        matchKey: key,
        quantity: amount.kind === 'measured' ? amount.quantity : null,
        unit: amount.kind === 'measured' ? amount.unit : null,
        usedAll: false,
        foodId: null,
      })
    }

    if (itemRows.length > 0) await tx.insert(journalItems).values(itemRows)

    // Bought for this meal = done on the shopping list. One direction only:
    // buying "hành lá tươi" ticks "hành lá", but buying "hành" must not tick
    // "hành tây" — `covers` alone would allow both.
    if (boughtKeys.length > 0) {
      const open = await tx
        .select({ id: shoppingItems.id, matchKey: shoppingItems.matchKey })
        .from(shoppingItems)
        .where(and(eq(shoppingItems.userId, userId), isNull(shoppingItems.boughtAt)))
      const hit = open
        .filter((row) => boughtKeys.some((k) => k === row.matchKey || k.startsWith(`${row.matchKey} `)))
        .map((r) => r.id)
      if (hit.length > 0) {
        await tx.update(shoppingItems).set({ boughtAt: new Date() }).where(inArray(shoppingItems.id, hit))
      }
    }

    return entry.id
  })

  return { entryId, pantry: change, conquered }
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export type JournalCard = JournalEntry & {
  dishes: Pick<JournalDish, 'name' | 'recipeId'>[]
  usedCount: number
}

/** Newest first: by the day it was cooked, then by when it was logged. */
export async function listJournal(
  db: Db,
  userId: string,
  { limit = 20 }: { limit?: number } = {},
): Promise<JournalCard[]> {
  const entries = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.userId, userId))
    .orderBy(desc(journalEntries.cookedOn), desc(journalEntries.createdAt))
    .limit(limit)
  if (entries.length === 0) return []

  const ids = entries.map((e) => e.id)
  const [dishes, counts] = await Promise.all([
    db
      .select({ entryId: journalDishes.entryId, name: journalDishes.name, recipeId: journalDishes.recipeId })
      .from(journalDishes)
      .where(inArray(journalDishes.entryId, ids))
      .orderBy(journalDishes.position),
    db
      .select({ entryId: journalItems.entryId, n: sql<number>`count(*)::int` })
      .from(journalItems)
      .where(and(inArray(journalItems.entryId, ids), eq(journalItems.kind, 'used')))
      .groupBy(journalItems.entryId),
  ])

  const used = new Map(counts.map((c) => [c.entryId, c.n]))
  return entries.map((e) => ({
    ...e,
    dishes: dishes.filter((d) => d.entryId === e.id),
    usedCount: used.get(e.id) ?? 0,
  }))
}

export async function getMeal(
  db: Db,
  userId: string,
  entryId: string,
): Promise<{ entry: JournalEntry; dishes: JournalDish[]; items: JournalItem[] } | null> {
  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId)))
  if (!entry) return null

  const [dishes, items] = await Promise.all([
    db.select().from(journalDishes).where(eq(journalDishes.entryId, entryId)).orderBy(journalDishes.position),
    db.select().from(journalItems).where(eq(journalItems.entryId, entryId)).orderBy(journalItems.position),
  ])
  return { entry, dishes, items }
}

/**
 * Delete a meal. The pantry is NOT refilled: by now the fridge has moved on,
 * and adding back 400 g of cá lóc that was eaten would be the pantry lying.
 * Returns the photo path so the caller can remove the file.
 */
export async function deleteMeal(db: Db, userId: string, entryId: string): Promise<{ photoPath: string | null } | null> {
  const [row] = await db
    .delete(journalEntries)
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, userId)))
    .returning({ photoPath: journalEntries.photoPath })
  return row ?? null
}

/** Meals logged this week (Monday to today) and today. */
export async function mealCounts(db: Db, userId: string): Promise<{ today: number; week: number }> {
  const today = vnDate()
  const [row] = await db
    .select({
      week: sql<number>`count(*)::int`,
      today: sql<number>`count(*) filter (where ${journalEntries.cookedOn} = ${today})::int`,
    })
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), sql`${journalEntries.cookedOn} between ${weekStart(today)} and ${today}`))
  return { today: row?.today ?? 0, week: row?.week ?? 0 }
}

/** Recipes to pick from on the log screen: newest touched first, search text included for client filtering. */
export async function recipeChoices(db: Db, userId: string) {
  return db
    .select({ id: recipes.id, title: recipes.title, searchText: recipes.searchText })
    .from(recipes)
    .where(eq(recipes.userId, userId))
    .orderBy(desc(recipes.updatedAt))
}
