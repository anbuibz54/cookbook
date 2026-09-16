/**
 * Streak rules. No database.   pnpm check:streaks
 *
 * Today is Wednesday 2026-09-16 in every case (its week starts Monday 09-14).
 */
import { addDays, streakStatus, type StreakRule } from '../src/lib/streaks.ts'

const today = '2026-09-16'
const back = (...n: number[]) => new Set(n.map((i) => addDays(today, -i)))
const daily: StreakRule = { kind: 'daily', restPerWeek: 0, timesPerWeek: 1 }
const rest1: StreakRule = { kind: 'daily_rest', restPerWeek: 1, timesPerWeek: 1 }
const weekly1: StreakRule = { kind: 'weekly', restPerWeek: 0, timesPerWeek: 1 }
const weekly3: StreakRule = { kind: 'weekly', restPerWeek: 0, timesPerWeek: 3 }
const since = '2026-01-01'

type Status = ReturnType<typeof streakStatus>
const cases: [string, Status, Partial<Status>][] = [
  ['daily: nothing', streakStatus(daily, back(), today, since), { current: 0, best: 0 }],
  ['daily: today not done yet keeps the run', streakStatus(daily, back(1, 2, 3), today, since), { current: 3, doneToday: false }],
  ['daily: today done', streakStatus(daily, back(0, 1, 2), today, since), { current: 3, doneToday: true }],
  ['daily: yesterday missed breaks it', streakStatus(daily, back(2, 3, 4), today, since), { current: 0, best: 3 }],
  ['rest 1/week: one miss last week is covered', streakStatus(rest1, back(0, 1, 2, 3, 5, 6), today, since), { current: 6 }],
  ['rest 1/week: two misses in one week (13th, 11th) end it', streakStatus(rest1, back(0, 1, 2, 4, 6, 7), today, since), { current: 4 }],
  ['rest 1/week: misses in different weeks are fine', streakStatus(rest1, back(0, 2, 3, 4, 5, 6, 7, 9, 10), today, since), { current: 9 }],
  ['rest 1/week: yesterday missed is a rest day, not a break', streakStatus(rest1, back(2, 3), today, since), { current: 2, restUsed: 1 }],
  ['weekly 1: this week + two before', streakStatus(weekly1, back(1, 8, 14), today, since), { current: 3, thisWeek: 1 }],
  ['weekly 1: this week not yet does not break', streakStatus(weekly1, back(7, 14), today, since), { current: 2, thisWeek: 0 }],
  ['weekly 1: a skipped week breaks', streakStatus(weekly1, back(0, 21), today, since), { current: 1, best: 1 }],
  ['weekly 3: two days is not a week', streakStatus(weekly3, back(0, 1, 7, 8, 9), today, since), { current: 1, thisWeek: 2 }],
]

let failed = 0
for (const [name, got, want] of cases) {
  const bad = Object.entries(want).filter(
    ([k, v]) => JSON.stringify(got[k as keyof Status]) !== JSON.stringify(v),
  )
  if (bad.length) failed++
  const detail = bad.map(([k]) => `${k}=${JSON.stringify(got[k as keyof Status])}`).join(', ')
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${name}${bad.length ? ` → ${detail}` : ''}`)
}

// 09-10 missed, 11 missed, 12 done, 13 done, 14 (Mon) rest, 15 done, 16 pending.
const grid = streakStatus(rest1, back(1, 3, 4), today, since)
  .lastSeven.map((c) => c.state[0])
  .join('')
const wantGrid = 'mmddrdp'
console.log(`${grid === wantGrid ? 'ok  ' : 'FAIL'} rest grid ${grid} (want ${wantGrid})`)
if (grid !== wantGrid) failed++

if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
