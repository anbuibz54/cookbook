/**
 * The reminder run. Called every 15 minutes by Supabase pg_cron (through
 * pg_net → POST /api/reminders/tick). Idempotent: running it twice in the same
 * minute, or a late run after a missed one, never sends a reminder twice.
 *
 * A streak is due when its `remind_at` has passed today (Vietnam time), not by
 * more than WINDOW_MINUTES — a 17:00 reminder is not sent at 22:00 because the
 * scheduler was down, and creating a streak at 20:00 with a 17:00 reminder does
 * not fire one straight away.
 *
 * Due streaks are CLAIMED first (last_reminded_on = today, only where it was
 * not already today), then evaluated, then sent — claim-before-send is what
 * makes overlapping runs safe. A streak whose day already counts is claimed
 * and not sent.
 *
 * Several streaks due in the same run for the same person become ONE
 * notification.
 *
 * No `next/*` imports.
 */

import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm'
import type { Db } from '../db'
import { streaks, wishes } from '../db/schema'
import { vnDate } from '@/lib/dates'
import { streakCards, type StreakCard } from '../motivation/service'
import { sendToUser, type Notice } from './service'

const WINDOW_MINUTES = 120

function vnClock(now: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(now)
}

function minutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function needsNudge(card: StreakCard) {
  return card.kind === 'weekly' ? card.thisWeek < card.timesPerWeek : !card.doneToday
}

function line(card: StreakCard, wish: string | null) {
  if (card.kind === 'weekly') {
    const left = card.timesPerWeek - card.thisWeek
    return `${card.name}: tuần này còn ${left} lần${wish ? ` — thử ${wish}?` : ''}`
  }
  const keep = card.current > 0 ? ` để giữ chuỗi ${card.current} ngày` : ''
  if (card.trigger === 'any_meal') return `Hôm nay chưa ghi bữa${keep}.`
  return `${card.name}: hôm nay chưa tick${keep}.`
}

export function noticeFor(cards: StreakCard[], wish: string | null): Notice {
  if (cards.length === 1) {
    const [card] = cards
    return {
      title: card.name,
      body: line(card, wish),
      path: card.trigger === 'tick' ? '/' : '/log',
      tag: `streak-${card.id}`,
    }
  }
  return {
    title: `${cards.length} streak đang chờ`,
    body: cards.map((c) => line(c, wish)).join('\n'),
    path: '/',
    tag: 'streaks',
  }
}

export type TickReport = { at: string; due: number; nudged: number; sent: number; removed: number }

export async function runReminders(db: Db, now = new Date()): Promise<TickReport> {
  const today = vnDate(0, now)
  const clock = vnClock(now)
  const nowMin = minutes(clock)

  const candidates = await db
    .select({ id: streaks.id, userId: streaks.userId, remindAt: streaks.remindAt })
    .from(streaks)
    .where(
      and(
        isNotNull(streaks.remindAt),
        sql`${streaks.remindAt} <= ${clock}`,
        or(isNull(streaks.lastRemindedOn), ne(streaks.lastRemindedOn, today)),
      ),
    )
  const inWindow = candidates.filter((c) => nowMin - minutes(c.remindAt!) <= WINDOW_MINUTES)
  if (inWindow.length === 0) return { at: `${today} ${clock}`, due: 0, nudged: 0, sent: 0, removed: 0 }

  // Claim. Only rows this run flipped are ours to send.
  const claimed = await db
    .update(streaks)
    .set({ lastRemindedOn: today })
    .where(
      and(
        inArray(streaks.id, inWindow.map((c) => c.id)),
        or(isNull(streaks.lastRemindedOn), ne(streaks.lastRemindedOn, today)),
      ),
    )
    .returning({ id: streaks.id, userId: streaks.userId })

  const byUser = new Map<string, Set<string>>()
  for (const row of claimed) byUser.set(row.userId, (byUser.get(row.userId) ?? new Set()).add(row.id))

  let nudged = 0
  let sent = 0
  let removed = 0
  for (const [userId, ids] of byUser) {
    const cards = (await streakCards(db, userId)).filter((c) => ids.has(c.id) && needsNudge(c))
    if (cards.length === 0) continue
    nudged += cards.length

    const [wish] = cards.some((c) => c.trigger === 'new_dish')
      ? await db
          .select({ title: wishes.title })
          .from(wishes)
          .where(and(eq(wishes.userId, userId), isNull(wishes.conqueredEntryId)))
          .orderBy(wishes.createdAt)
          .limit(1)
      : []

    const result = await sendToUser(db, userId, noticeFor(cards, wish?.title ?? null))
    sent += result.sent
    removed += result.removed
  }

  return { at: `${today} ${clock}`, due: claimed.length, nudged, sent, removed }
}
