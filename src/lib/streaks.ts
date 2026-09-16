/**
 * Streak arithmetic. Pure: takes the set of days that counted, returns what
 * the cards show. `pnpm check:streaks` pins the rules down.
 *
 * Days are YYYY-MM-DD strings in Vietnam's calendar; weeks run Monday–Sunday.
 * Today never breaks a streak: until midnight it is "not yet", not "missed".
 */

import { weekStart } from './dates'

export type StreakRule = {
  kind: 'daily' | 'daily_rest' | 'weekly'
  restPerWeek: number
  timesPerWeek: number
}

/**
 *  - done     counted
 *  - rest     missed, but covered by the week's rest allowance
 *  - missed   missed and it cost the streak (or no streak was running)
 *  - pending  today, not done yet
 *  - idle     no expectation (before the streak existed, or a weekly streak's off day)
 */
export type DayState = 'done' | 'rest' | 'missed' | 'pending' | 'idle'

export type StreakStatus = {
  current: number
  /** "ngày" for daily kinds, "tuần" for weekly. */
  unit: 'ngày' | 'tuần'
  best: number
  doneToday: boolean
  /** The last seven days, oldest first, today last. */
  lastSeven: { day: string; state: DayState }[]
  /** daily_rest: rest days already used this week. */
  restUsed: number
  /** weekly: days counted this week. */
  thisWeek: number
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/**
 * A daily_rest run ending at `end`, walking back until a week runs out of
 * rest days. Returns the done days it holds and the day that broke it
 * (every day after `stop` is inside the run).
 */
function restRun(done: Set<string>, end: string, rest: number, earliest: string) {
  let count = 0
  const misses = new Map<string, number>()
  for (let d = end; d >= earliest; d = addDays(d, -1)) {
    if (done.has(d)) {
      count++
      continue
    }
    const w = weekStart(d)
    const m = (misses.get(w) ?? 0) + 1
    if (m > rest) return { count, stop: d }
    misses.set(w, m)
  }
  return { count, stop: addDays(earliest, -1) }
}

export function streakStatus(
  rule: StreakRule,
  done: Set<string>,
  today: string,
  /** The day the streak was created: earlier days show as idle unless done. */
  since: string,
): StreakStatus {
  const days = [...done].filter((d) => d <= today).sort()
  const earliest = days[0] ?? today
  const doneToday = done.has(today)
  const yesterday = addDays(today, -1)
  const lastSeven = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))

  if (rule.kind === 'weekly') {
    const need = Math.max(1, rule.timesPerWeek)
    const count = (week: string) => days.filter((d) => d >= week && d <= addDays(week, 6)).length
    const thisWeekStart = weekStart(today)
    const thisWeek = count(thisWeekStart)

    // The current week only adds once it is met; until then it does not break anything.
    let current = thisWeek >= need ? 1 : 0
    for (let w = addDays(thisWeekStart, -7); w >= weekStart(earliest) && count(w) >= need; w = addDays(w, -7)) {
      current++
    }

    let best = 0
    let run = 0
    for (let w = weekStart(earliest); w < thisWeekStart; w = addDays(w, 7)) {
      run = count(w) >= need ? run + 1 : 0
      best = Math.max(best, run)
    }

    return {
      current,
      unit: 'tuần',
      best: Math.max(best, current),
      doneToday,
      lastSeven: lastSeven.map((day) => ({
        day,
        state: done.has(day) ? 'done' : day === today ? 'pending' : 'idle',
      })),
      restUsed: 0,
      thisWeek,
    }
  }

  if (rule.kind === 'daily') {
    let current = 0
    for (let d = doneToday ? today : yesterday; done.has(d); d = addDays(d, -1)) current++

    let best = 0
    let run = 0
    let prev: string | null = null
    for (const d of days) {
      run = prev && addDays(prev, 1) === d ? run + 1 : 1
      best = Math.max(best, run)
      prev = d
    }

    return {
      current,
      unit: 'ngày',
      best,
      doneToday,
      lastSeven: lastSeven.map((day) => ({
        day,
        state: done.has(day) ? 'done' : day === today ? 'pending' : day < since ? 'idle' : 'missed',
      })),
      restUsed: 0,
      thisWeek: 0,
    }
  }

  // daily_rest
  const rest = Math.max(0, rule.restPerWeek)
  const { count: current, stop } = days.length
    ? restRun(done, doneToday ? today : yesterday, rest, earliest)
    : { count: 0, stop: today }

  let best = current
  for (const d of days) best = Math.max(best, restRun(done, d, rest, earliest).count)

  const inRun = (day: string) => current > 0 && day > stop && day < today
  const restUsed = lastSeven.filter((day) => day >= weekStart(today) && !done.has(day) && inRun(day)).length

  return {
    current,
    unit: 'ngày',
    best,
    doneToday,
    lastSeven: lastSeven.map((day) => ({
      day,
      state: done.has(day)
        ? 'done'
        : day === today
          ? 'pending'
          : inRun(day)
            ? 'rest'
            : day < since
              ? 'idle'
              : 'missed',
    })),
    restUsed,
    thisWeek: 0,
  }
}
