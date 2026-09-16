/**
 * The month in one card: what the shareable image shows.
 *
 * Every number is read from the journal the same way Thành tích reads it, so
 * the card can never brag about something the app itself does not show.
 *
 * No `next/*` imports.
 */

import { and, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm'
import type { Db } from '../db'
import { journalEntries, wishes } from '../db/schema'
import { vnDate } from '@/lib/dates'
import { dishHistory, goalCards, streakCards } from './service'

export type Recap = {
  month: string
  label: string
  meals: number
  newDishes: number
  photos: { id: string; path: string }[]
  /** Three stat boxes, biggest story first. */
  stats: { value: string; label: string }[]
  /** A sticker, when the month earned one. */
  badge: string | null
}

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number)
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return { start: `${month}-01`, end }
}

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}

export async function monthRecap(db: Db, userId: string, month = vnDate().slice(0, 7)): Promise<Recap> {
  const { start, end } = monthBounds(month)
  const today = vnDate()
  const current = today.slice(0, 7) === month

  const history = await dishHistory(db, userId)
  const [[{ meals }], photos, streaks, goals, conquered] = await Promise.all([
    db
      .select({ meals: sql<number>`count(*)::int` })
      .from(journalEntries)
      .where(and(eq(journalEntries.userId, userId), gte(journalEntries.cookedOn, start), lte(journalEntries.cookedOn, end))),
    db
      .select({ id: journalEntries.id, path: journalEntries.photoPath })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.userId, userId),
          gte(journalEntries.cookedOn, start),
          lte(journalEntries.cookedOn, end),
          isNotNull(journalEntries.photoPath),
        ),
      )
      .orderBy(desc(journalEntries.cookedOn), desc(journalEntries.createdAt))
      .limit(6),
    current ? streakCards(db, userId, { history }) : Promise.resolve([]),
    goalCards(db, userId, { history }),
    db
      .select({ title: wishes.title })
      .from(wishes)
      .innerJoin(journalEntries, eq(wishes.conqueredEntryId, journalEntries.id))
      .where(and(eq(wishes.userId, userId), gte(journalEntries.cookedOn, start), lte(journalEntries.cookedOn, end)))
      .orderBy(desc(journalEntries.cookedOn)),
  ])

  const newDishes = history.filter((d) => d.isNew && d.day >= start && d.day <= end).length
  const stats: Recap['stats'] = []

  // Only the current month has a meaningful "chuỗi đang giữ".
  const daily = streaks.filter((s) => s.unit === 'ngày' && s.current > 0).sort((a, b) => b.current - a.current)[0]
  if (daily) stats.push({ value: String(daily.current), label: `ngày ${daily.name.charAt(0).toLowerCase()}${daily.name.slice(1)}` })

  stats.push({ value: String(newDishes), label: 'món mới chinh phục' })

  const goal = goals
    .filter((g) => g.startsOn <= end && g.endsOn >= start)
    .sort((a, b) => b.progress / b.target - a.progress / a.target)[0]
  if (goal) {
    stats.push({ value: `${Math.min(100, Math.round((goal.progress / goal.target) * 100))}%`, label: goal.title })
  } else if (conquered.length) {
    stats.push({ value: String(conquered.length), label: 'món trên bảng đã chinh phục' })
  } else {
    stats.push({ value: String(photos.length), label: 'bữa có ảnh' })
  }

  const badge = conquered[0]
    ? `chinh phục ${conquered[0].title.toLowerCase()}`
    : newDishes >= 3
      ? `${newDishes} món mới`
      : meals >= 20
        ? 'tháng chăm bếp'
        : null

  return {
    month,
    label: `THÁNG ${Number(month.slice(5))} · ${month.slice(0, 4)}`,
    meals,
    newDishes,
    photos: photos.map((p) => ({ id: p.id, path: p.path! })),
    stats: stats.slice(0, 3),
    badge,
  }
}
