/**
 * Motivation: streaks, goals, the wish board, and the numbers on "Thành tích".
 *
 * Everything that can be derived from the journal IS derived, on read —
 * meals per day, first-time dishes, goal progress, streak days for
 * `any_meal`/`new_dish`. Only what the journal cannot know is stored: which
 * days the user ticked a `tick` streak, and which meal conquered a wish.
 * That way deleting or back-dating a meal can never leave a number lying.
 *
 * No `next/*` imports.
 */

import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db'
import {
  goals,
  journalDishes,
  journalEntries,
  recipes,
  streakCheckins,
  streaks,
  wishes,
} from '../db/schema'
import { vnDate } from '@/lib/dates'
import { matchKey } from '@/lib/match'
import { addDays, streakStatus, type StreakStatus } from '@/lib/streaks'
import { normalizeForSearch } from '@/lib/text'

export type Streak = typeof streaks.$inferSelect
export type Goal = typeof goals.$inferSelect
export type Wish = typeof wishes.$inferSelect

/* -------------------------------------------------------------------------- */
/* Dish history                                                                */
/* -------------------------------------------------------------------------- */

export type CookedDish = {
  entryId: string
  day: string
  recipeId: string | null
  name: string
  matchKey: string
  /** First time this dish appears in the journal. */
  isNew: boolean
}

/** Identity of a dish across meals: the recipe when there is one, and always its name. */
export function dishKeys(dish: { recipeId: string | null; matchKey: string }): string[] {
  return dish.recipeId ? [`r:${dish.recipeId}`, `n:${dish.matchKey}`] : [`n:${dish.matchKey}`]
}

/**
 * Every dish ever logged, oldest first, with "món mới" marked. A dish is new
 * when neither its recipe nor its name was logged in an earlier meal.
 */
export async function dishHistory(db: Db, userId: string): Promise<CookedDish[]> {
  const rows = await db
    .select({
      entryId: journalDishes.entryId,
      day: journalEntries.cookedOn,
      recipeId: journalDishes.recipeId,
      name: journalDishes.name,
      matchKey: journalDishes.matchKey,
    })
    .from(journalDishes)
    .innerJoin(journalEntries, eq(journalDishes.entryId, journalEntries.id))
    .where(eq(journalEntries.userId, userId))
    .orderBy(asc(journalEntries.cookedOn), asc(journalEntries.createdAt), asc(journalDishes.position))

  const seen = new Set<string>()
  return rows.map((row) => {
    const keys = dishKeys(row)
    const isNew = !keys.some((k) => seen.has(k))
    for (const k of keys) seen.add(k)
    return { ...row, isNew }
  })
}

/* -------------------------------------------------------------------------- */
/* Streaks                                                                     */
/* -------------------------------------------------------------------------- */

export const streakInput = z
  .object({
    name: z.string().trim().min(1, 'Đặt tên cho streak nhé.').max(60),
    kind: z.enum(['daily', 'daily_rest', 'weekly']),
    restPerWeek: z.coerce.number().int().min(1).max(3).default(1),
    timesPerWeek: z.coerce.number().int().min(1).max(7).default(1),
    trigger: z.enum(['tick', 'any_meal', 'new_dish']),
    remindAt: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ nhắc phải dạng HH:MM.')
      .nullish(),
  })

export type StreakInput = z.output<typeof streakInput>

/** Ready-made streaks offered when there are none yet. */
export const STREAK_PRESETS: Record<string, StreakInput> = {
  'com-nha': { name: 'Nấu cơm cho vợ', kind: 'daily_rest', restPerWeek: 1, timesPerWeek: 1, trigger: 'tick', remindAt: '17:00' },
  'nhat-ky': { name: 'Ghi nhật ký', kind: 'daily', restPerWeek: 1, timesPerWeek: 1, trigger: 'any_meal', remindAt: '21:00' },
  'mon-moi': { name: 'Chinh phục món mới', kind: 'weekly', restPerWeek: 1, timesPerWeek: 1, trigger: 'new_dish', remindAt: null },
}

export async function listStreaks(db: Db, userId: string): Promise<Streak[]> {
  return db.select().from(streaks).where(eq(streaks.userId, userId)).orderBy(asc(streaks.position), asc(streaks.createdAt))
}

export async function getStreak(db: Db, userId: string, id: string): Promise<Streak | null> {
  const [row] = await db.select().from(streaks).where(and(eq(streaks.id, id), eq(streaks.userId, userId)))
  return row ?? null
}

export async function createStreak(db: Db, userId: string, input: StreakInput): Promise<Streak> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(streaks).where(eq(streaks.userId, userId))
  const [row] = await db
    .insert(streaks)
    .values({ userId, ...input, remindAt: input.remindAt ?? null, position: n })
    .returning()
  return row
}

export async function updateStreak(db: Db, userId: string, id: string, input: StreakInput): Promise<boolean> {
  const rows = await db
    .update(streaks)
    .set({ ...input, remindAt: input.remindAt ?? null })
    .where(and(eq(streaks.id, id), eq(streaks.userId, userId)))
    .returning({ id: streaks.id })
  return rows.length > 0
}

export async function deleteStreak(db: Db, userId: string, id: string): Promise<void> {
  await db.delete(streaks).where(and(eq(streaks.id, id), eq(streaks.userId, userId)))
}

/** Tick or untick today by hand (a `tick` streak on Hôm nay). */
export async function toggleCheckin(db: Db, userId: string, streakId: string, day = vnDate()): Promise<boolean> {
  const streak = await getStreak(db, userId, streakId)
  if (!streak || streak.trigger !== 'tick') return false

  const removed = await db
    .delete(streakCheckins)
    .where(and(eq(streakCheckins.streakId, streakId), eq(streakCheckins.day, day)))
    .returning({ id: streakCheckins.id })
  if (removed.length === 0) await db.insert(streakCheckins).values({ streakId, day })
  return removed.length === 0
}

export type StreakCard = Streak & StreakStatus

/** How far back streak history is read. A streak longer than this shows as this long. */
const HISTORY_DAYS = 400

export async function streakCards(
  db: Db,
  userId: string,
  { history }: { history?: CookedDish[] } = {},
): Promise<StreakCard[]> {
  const list = await listStreaks(db, userId)
  if (list.length === 0) return []

  const today = vnDate()
  const since = addDays(today, -HISTORY_DAYS)
  const needs = new Set(list.map((s) => s.trigger))

  const [checkins, mealDays, dishes] = await Promise.all([
    needs.has('tick')
      ? db
          .select({ streakId: streakCheckins.streakId, day: streakCheckins.day })
          .from(streakCheckins)
          .where(and(inArray(streakCheckins.streakId, list.map((s) => s.id)), gte(streakCheckins.day, since)))
      : [],
    needs.has('any_meal')
      ? db
          .selectDistinct({ day: journalEntries.cookedOn })
          .from(journalEntries)
          .where(and(eq(journalEntries.userId, userId), gte(journalEntries.cookedOn, since)))
      : [],
    needs.has('new_dish') ? (history ?? dishHistory(db, userId)) : [],
  ])

  const anyMeal = new Set(mealDays.map((r) => r.day))
  const newDish = new Set(dishes.filter((d) => d.isNew).map((d) => d.day))

  return list.map((streak) => {
    const done =
      streak.trigger === 'tick'
        ? new Set(checkins.filter((c) => c.streakId === streak.id).map((c) => c.day))
        : streak.trigger === 'any_meal'
          ? anyMeal
          : newDish
    const created = vnDate(0, streak.createdAt)
    return { ...streak, ...streakStatus(streak, done, today, created) }
  })
}

/** "Mỗi ngày · nghỉ được 1 ngày/tuần · nhắc 17:00" */
export function describeStreak(streak: Pick<Streak, 'kind' | 'restPerWeek' | 'timesPerWeek' | 'trigger' | 'remindAt'>) {
  const kind =
    streak.kind === 'daily'
      ? 'Mỗi ngày'
      : streak.kind === 'daily_rest'
        ? `Mỗi ngày · nghỉ được ${streak.restPerWeek} ngày/tuần`
        : `${streak.timesPerWeek} lần mỗi tuần`
  const trigger =
    streak.trigger === 'tick' ? null : streak.trigger === 'any_meal' ? 'tự tính khi ghi bữa' : 'tự nhận món chưa từng nấu'
  return [kind, trigger, streak.remindAt ? `nhắc ${streak.remindAt}` : null].filter(Boolean).join(' · ')
}

/* -------------------------------------------------------------------------- */
/* Goals                                                                       */
/* -------------------------------------------------------------------------- */

export const goalInput = z
  .object({
    title: z.string().trim().min(1, 'Đặt tên cho mục tiêu nhé.').max(80),
    metric: z.enum(['meals', 'new_dishes', 'tagged']),
    tag: z.string().trim().max(40).nullish(),
    target: z.coerce.number().int().min(1, 'Mục tiêu ít nhất là 1.').max(1000),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((g) => g.endsOn >= g.startsOn, { message: 'Ngày kết thúc phải sau ngày bắt đầu.', path: ['endsOn'] })
  .refine((g) => g.metric !== 'tagged' || Boolean(g.tag), { message: 'Chọn tag cho mục tiêu này.', path: ['tag'] })

export type GoalInput = z.output<typeof goalInput>
export type GoalCard = Goal & { progress: number; done: boolean; daysLeft: number }

export async function createGoal(db: Db, userId: string, input: GoalInput): Promise<void> {
  await db.insert(goals).values({ userId, ...input, tag: input.metric === 'tagged' ? (input.tag ?? null) : null })
}

export async function deleteGoal(db: Db, userId: string, id: string): Promise<void> {
  await db.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)))
}

/** Goals still running, and ones that ended in the last 30 days (so a finished goal is seen). */
export async function goalCards(
  db: Db,
  userId: string,
  { history }: { history?: CookedDish[] } = {},
): Promise<GoalCard[]> {
  const today = vnDate()
  const list = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), gte(goals.endsOn, addDays(today, -30))))
    .orderBy(asc(goals.endsOn))
  if (list.length === 0) return []

  const dishes = history ?? (await dishHistory(db, userId))
  const needsTags = list.some((g) => g.metric === 'tagged')
  const tagged = needsTags
    ? await db.select({ id: recipes.id, tags: recipes.tags }).from(recipes).where(eq(recipes.userId, userId))
    : []

  const mealDays = await db
    .select({ day: journalEntries.cookedOn, n: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.userId, userId),
        gte(journalEntries.cookedOn, list.reduce((min, g) => (g.startsOn < min ? g.startsOn : min), today)),
      ),
    )
    .groupBy(journalEntries.cookedOn)

  return list.map((goal) => {
    const inRange = (day: string) => day >= goal.startsOn && day <= goal.endsOn
    let progress = 0
    if (goal.metric === 'meals') {
      progress = mealDays.filter((d) => inRange(d.day)).reduce((sum, d) => sum + d.n, 0)
    } else if (goal.metric === 'new_dishes') {
      progress = dishes.filter((d) => d.isNew && inRange(d.day)).length
    } else {
      const tag = normalizeForSearch(goal.tag ?? '')
      const ids = new Set(tagged.filter((r) => r.tags.some((t) => normalizeForSearch(t) === tag)).map((r) => r.id))
      progress = new Set(dishes.filter((d) => d.recipeId && ids.has(d.recipeId) && inRange(d.day)).map((d) => d.recipeId)).size
    }
    const daysLeft = Math.round((Date.parse(goal.endsOn) - Date.parse(today)) / 86_400_000)
    return { ...goal, progress, done: progress >= goal.target, daysLeft }
  })
}

/* -------------------------------------------------------------------------- */
/* Wishes                                                                      */
/* -------------------------------------------------------------------------- */

export const wishInput = z.object({
  title: z.string().trim().max(80).nullish(),
  recipeId: z.uuid().nullish(),
  sourceUrl: z.url('Link không hợp lệ.').max(500).nullish(),
  note: z.string().trim().max(300).nullish(),
})

export type WishInput = z.output<typeof wishInput>

export type WishCard = Wish & {
  conqueredOn: string | null
  conqueredPhoto: string | null
}

export async function createWish(db: Db, userId: string, input: WishInput): Promise<Wish> {
  let title = input.title?.trim() || null
  let recipeId: string | null = null
  if (input.recipeId) {
    const [recipe] = await db
      .select({ id: recipes.id, title: recipes.title })
      .from(recipes)
      .where(and(eq(recipes.id, input.recipeId), eq(recipes.userId, userId)))
    if (recipe) {
      recipeId = recipe.id
      title ??= recipe.title
    }
  }
  if (!title) throw new Error('Món gì vậy? Gõ tên hoặc chọn từ sổ.')

  const [row] = await db
    .insert(wishes)
    .values({
      userId,
      title,
      matchKey: matchKey(title),
      recipeId,
      sourceUrl: input.sourceUrl ?? null,
      note: input.note ?? null,
    })
    .returning()
  return row
}

export async function deleteWish(db: Db, userId: string, id: string): Promise<void> {
  await db.delete(wishes).where(and(eq(wishes.id, id), eq(wishes.userId, userId)))
}

/** Open wishes first (newest pinned first), then conquered ones, newest conquest first. */
export async function wishCards(db: Db, userId: string): Promise<WishCard[]> {
  const rows = await db
    .select({ wish: wishes, conqueredOn: journalEntries.cookedOn, conqueredPhoto: journalEntries.photoPath })
    .from(wishes)
    .leftJoin(journalEntries, eq(wishes.conqueredEntryId, journalEntries.id))
    .where(eq(wishes.userId, userId))
    .orderBy(sql`${wishes.conqueredEntryId} is not null`, desc(journalEntries.cookedOn), desc(wishes.createdAt))
  return rows.map((r) => ({ ...r.wish, conqueredOn: r.conqueredOn, conqueredPhoto: r.conqueredPhoto }))
}

/** The oldest open wish — the nudge under "Chinh phục món mới" on Hôm nay. */
export async function nextWish(db: Db, userId: string): Promise<Wish | null> {
  const [row] = await db
    .select()
    .from(wishes)
    .where(and(eq(wishes.userId, userId), isNull(wishes.conqueredEntryId)))
    .orderBy(asc(wishes.createdAt))
    .limit(1)
  return row ?? null
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Called inside the meal-saving transaction: mark open wishes this meal
 * contains as conquered. Recipe match, or the same normalised name.
 */
export async function conquerWishes(
  tx: Tx,
  userId: string,
  entryId: string,
  dishes: { recipeId: string | null; name: string }[],
): Promise<string[]> {
  const open = await tx
    .select({ id: wishes.id, title: wishes.title, recipeId: wishes.recipeId, matchKey: wishes.matchKey })
    .from(wishes)
    .where(and(eq(wishes.userId, userId), isNull(wishes.conqueredEntryId)))

  const hit = open.filter((w) =>
    dishes.some((d) => (w.recipeId && d.recipeId === w.recipeId) || matchKey(d.name) === w.matchKey),
  )
  if (hit.length > 0) {
    await tx.update(wishes).set({ conqueredEntryId: entryId }).where(inArray(wishes.id, hit.map((w) => w.id)))
  }
  return hit.map((w) => w.title)
}

/** Record ticked `tick` streaks for a meal, inside its transaction. Ignores ids that are not the user's tick streaks. */
export async function checkinForMeal(tx: Tx, userId: string, entryId: string, day: string, streakIds: string[]) {
  if (streakIds.length === 0) return
  const valid = await tx
    .select({ id: streaks.id })
    .from(streaks)
    .where(and(eq(streaks.userId, userId), eq(streaks.trigger, 'tick'), inArray(streaks.id, streakIds)))
  if (valid.length === 0) return
  await tx.insert(streakCheckins).values(valid.map((s) => ({ streakId: s.id, day, entryId })))
}

/* -------------------------------------------------------------------------- */
/* Stats and the photo wall                                                    */
/* -------------------------------------------------------------------------- */

export async function monthStats(db: Db, userId: string, history: CookedDish[]) {
  const today = vnDate()
  const monthStart = `${today.slice(0, 8)}01`
  const [{ meals }] = await db
    .select({ meals: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), gte(journalEntries.cookedOn, monthStart), lte(journalEntries.cookedOn, today)))
  const newDishes = history.filter((d) => d.isNew && d.day >= monthStart && d.day <= today).length
  return { meals, newDishes, month: Number(today.slice(5, 7)) }
}

export async function photoWall(db: Db, userId: string, { limit = 12 }: { limit?: number } = {}) {
  const today = vnDate()
  const monthStart = `${today.slice(0, 8)}01`
  const [photos, [{ n }]] = await Promise.all([
    db
      .select({ id: journalEntries.id, title: journalEntries.title, photoPath: journalEntries.photoPath })
      .from(journalEntries)
      .where(and(eq(journalEntries.userId, userId), isNotNull(journalEntries.photoPath)))
      .orderBy(desc(journalEntries.cookedOn), desc(journalEntries.createdAt))
      .limit(limit),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(journalEntries)
      .where(and(eq(journalEntries.userId, userId), isNotNull(journalEntries.photoPath), gte(journalEntries.cookedOn, monthStart)))
  ])
  return { photos: photos as { id: string; title: string; photoPath: string }[], thisMonth: n }
}
