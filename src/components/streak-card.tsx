import Link from 'next/link'
import { toggleCheckinAction } from '@/app/_actions/motivation'
import type { DayState } from '@/lib/streaks'
import { describeStreak, type StreakCard as Card } from '@/server/motivation/service'

const CELL: Record<DayState, string> = {
  done: 'bg-primary',
  rest: 'border border-dashed border-placeholder bg-line-soft',
  missed: 'bg-line-soft',
  pending: 'border-2 border-ink bg-surface',
  idle: 'bg-line-soft/60',
}

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function todayNote(card: Card) {
  if (card.kind === 'weekly') {
    return card.thisWeek >= card.timesPerWeek
      ? `tuần này xong (${card.thisWeek} lần)`
      : `${card.thisWeek}/${card.timesPerWeek} tuần này`
  }
  if (card.doneToday) return 'hôm nay xong rồi'
  return card.trigger === 'any_meal' ? 'hôm nay chưa ghi' : 'hôm nay chưa làm'
}

/** The tick for a `tick` streak, right on the card: a round check that fills in. */
function TickButton({ card }: { card: Card }) {
  return (
    <form action={toggleCheckinAction.bind(null, card.id)}>
      <button
        type="submit"
        aria-pressed={card.doneToday}
        aria-label={card.doneToday ? `Bỏ tick hôm nay cho ${card.name}` : `Tick hôm nay cho ${card.name}`}
        className={`flex size-11 items-center justify-center rounded-full border-2 border-ink ${
          card.doneToday ? 'bg-primary text-white' : 'bg-surface text-placeholder hover:text-ink'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12l5 5 9-10" />
        </svg>
      </button>
    </form>
  )
}

/**
 * One streak. `compact` for Hôm nay (today's status and the tick); the full
 * card on Thành tích adds the last seven days and links to editing.
 */
export function StreakCard({ card, compact = false, hint }: { card: Card; compact?: boolean; hint?: string | null }) {
  const pending = !card.doneToday && card.kind !== 'weekly'
  const weeklyProgress = card.kind === 'weekly' ? Math.min(1, card.thisWeek / Math.max(1, card.timesPerWeek)) : 0

  return (
    <div
      className={`flex flex-col gap-2.5 rounded-[18px] bg-surface px-3.5 py-3 ${
        compact && pending ? 'border-2 border-ink' : 'border border-line'
      }`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {compact ? (
            <span className="truncate font-semibold">{card.name}</span>
          ) : (
            <Link href={`/streaks/${card.id}`} transitionTypes={['nav-forward']} className="truncate font-semibold hover:underline">
              {card.name}
            </Link>
          )}
          <span className="text-xs text-pretty text-muted">
            {compact ? null : `${describeStreak(card)} · `}
            <span className={pending ? 'text-primary' : undefined}>{todayNote(card)}</span>
            {!compact && card.kind === 'daily_rest' && card.restUsed > 0 ? ` · đã nghỉ ${card.restUsed} ngày tuần này` : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="font-mono text-[22px] leading-none font-medium">{card.current}</span>
            <span className="text-[11px] text-muted">{card.unit}</span>
          </div>
          {card.trigger === 'tick' ? <TickButton card={card} /> : null}
        </div>
      </div>

      {card.kind === 'weekly' ? (
        <div className="h-2 rounded-full bg-line-soft">
          <div className="h-2 rounded-full bg-protein" style={{ width: `${weeklyProgress * 100}%` }} />
        </div>
      ) : null}

      {!compact && card.kind !== 'weekly' ? (
        <div className="grid grid-cols-7 gap-1.5">
          {card.lastSeven.map((cell) => (
            <div key={cell.day} className="flex flex-col items-center gap-1">
              <div title={cell.day} className={`h-[30px] w-full rounded-lg ${CELL[cell.state]}`} />
              <span className="text-[10px] text-muted">{WEEKDAY[new Date(`${cell.day}T00:00:00Z`).getUTCDay()]}</span>
            </div>
          ))}
        </div>
      ) : null}

      {!compact && card.best > card.current ? (
        <span className="text-xs text-muted">
          Kỷ lục {card.best} {card.unit}
        </span>
      ) : null}

      {hint ? <span className="text-xs text-pretty text-muted">{hint}</span> : null}
    </div>
  )
}
