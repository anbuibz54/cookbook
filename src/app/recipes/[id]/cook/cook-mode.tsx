'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Cook mode: one step at a time, on a dark screen, with the step's timer.
 *
 * Two things this screen owes the cook, both of which need the client:
 * a countdown that keeps time, and a screen that does not go dark mid-step.
 */

export type CookStep = {
  id: string
  body: string
  section: string | null
  timerSeconds: number | null
  /** Ingredient lines this step's text mentions, in recipe order. */
  ingredients: { id: string; name: string; amount: string | null }[]
}

const RING_RADIUS = 108
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

function clock(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * One step's countdown. Mounted with `key={step.id}`, so moving to another step
 * gives it a fresh, stopped timer with no reset logic to get wrong.
 *
 * The countdown is kept as a DEADLINE (`endsAt`), not a decremented counter: a
 * phone throttles timers the moment the screen dims or the tab is backgrounded,
 * and a counter would silently run slow. Comparing against the clock stays
 * right however long the interval was starved.
 */
function StepTimer({ total }: { total: number }) {
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(total)
  const rang = useRef(false)
  const audio = useRef<AudioContext | null>(null)

  /**
   * Prepared on the Start tap, because iOS only lets audio start from a user
   * gesture — build the context when the timer ends and nothing plays.
   */
  const prepareAlarm = () => {
    if (!audio.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor) audio.current = new Ctor()
    }
    void audio.current?.resume().catch(() => {})
  }

  /**
   * Three beeps. iPhone has no vibration API at all, so on that phone this is
   * the whole alarm; Android gets both. Either way it only reaches you while
   * the app is open — see the note under the buttons.
   */
  const ring = () => {
    navigator.vibrate?.([200, 100, 200, 100, 400])

    const ctx = audio.current
    if (!ctx || ctx.state !== 'running') return
    for (let i = 0; i < 3; i++) {
      const at = ctx.currentTime + i * 0.45
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      osc.connect(gain)
      gain.connect(ctx.destination)
      // Ramped, not switched: a square-edged tone clicks on small speakers.
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35)
      osc.start(at)
      osc.stop(at + 0.36)
    }
  }

  useEffect(() => {
    if (endsAt == null) return

    const tick = () => {
      const left = (endsAt - Date.now()) / 1000
      setRemaining(Math.max(0, left))
      if (left > 0) return

      setEndsAt(null)
      if (!rang.current) {
        rang.current = true
        ring()
      }
    }

    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [endsAt])

  const running = endsAt != null
  const done = remaining <= 0
  const progress = total > 0 ? 1 - remaining / total : 0

  return (
    <>
      <div className="flex justify-center py-1">
        <div className="relative size-60">
          <svg width="240" height="240" viewBox="0 0 240 240" className="block" aria-hidden="true">
            <circle cx="120" cy="120" r={RING_RADIUS} fill="none" stroke="var(--cook-line)" strokeWidth="14" />
            <circle
              cx="120"
              cy="120"
              r={RING_RADIUS}
              fill="none"
              stroke={done ? 'var(--protein)' : 'var(--primary)'}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - progress)}
              transform="rotate(-90 120 120)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span
              aria-live="polite"
              className="font-mono text-[52px] leading-none font-medium tracking-tight tabular-nums"
            >
              {clock(remaining)}
            </span>
            <span className="text-[13px] text-cook-muted">
              {done ? 'Xong rồi!' : running ? 'còn lại' : `hẹn ${Math.round(total / 60)} phút`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => {
            prepareAlarm()
            setEndsAt(running ? null : Date.now() + remaining * 1000)
          }}
          disabled={done}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-cook-surface font-medium disabled:opacity-40"
        >
          {running ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5l11 7-11 7z" />
            </svg>
          )}
          {running ? 'Tạm dừng' : 'Bắt đầu'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEndsAt(null)
            setRemaining(total)
            rang.current = false
          }}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-cook-surface font-medium"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12a8 8 0 1 1 2.5 5.8" />
            <path d="M4 7v5h5" />
          </svg>
          Đặt lại
        </button>
      </div>

      <p className="text-center text-xs text-cook-faint text-pretty">
        Chuông chỉ kêu khi app đang mở. Tắt màn hình hay chuyển app thì đồng hồ vẫn chạy đúng, nhưng
        không báo được.
      </p>
    </>
  )
}

/**
 * Keep the screen on while cooking. The lock dies whenever the page is hidden
 * (switching apps, locking the phone), so it is re-requested when the page
 * comes back. Unsupported or refused simply means no promise is made — the
 * line at the bottom only appears when a lock is actually held.
 */
function useScreenAwake() {
  const [awake, setAwake] = useState(false)

  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        sentinel = (await navigator.wakeLock?.request('screen')) ?? null
        if (cancelled) {
          void sentinel?.release()
          return
        }
        setAwake(Boolean(sentinel))
        sentinel?.addEventListener('release', () => setAwake(false))
      } catch {
        setAwake(false)
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {})
    }
  }, [])

  return awake
}

export function CookMode({
  recipeId,
  title,
  steps,
}: {
  recipeId: string
  title: string
  steps: CookStep[]
}) {
  const [index, setIndex] = useState(0)
  const awake = useScreenAwake()

  const go = useCallback(
    (delta: number) => setIndex((i) => Math.min(steps.length - 1, Math.max(0, i + delta))),
    [steps.length],
  )

  const step = steps[index]
  const last = index === steps.length - 1

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 bg-cook-bg px-[18px] pt-5 pb-6 text-cook-ink">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[13px] text-cook-muted">
          Bước {index + 1} / {steps.length}
        </span>
        <Link
          href={`/recipes/${recipeId}`} transitionTypes={['nav-back']}
          aria-label="Thoát chế độ nấu"
          className="flex size-11 items-center justify-center rounded-full bg-cook-surface"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
      </div>

      <div className="flex gap-1.5" aria-hidden="true">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className={`h-1.5 grow rounded-full ${
              i < index ? 'bg-protein' : i === index ? 'bg-primary' : 'bg-cook-line'
            }`}
          />
        ))}
      </div>

      <h1 className="sr-only">Đang nấu {title}</h1>
      {step.section ? (
        <span className="text-xs font-semibold tracking-wider text-cook-muted uppercase">
          {step.section}
        </span>
      ) : null}

      <p className="font-display text-[27px] leading-snug font-bold text-pretty">{step.body}</p>

      {step.timerSeconds ? <StepTimer key={step.id} total={step.timerSeconds} /> : null}

      {step.ingredients.length > 0 ? (
        <section className="flex flex-col gap-2.5 rounded-[18px] bg-cook-surface px-4 py-3.5">
          <span className="text-xs text-cook-muted">Nguyên liệu nhắc trong bước này</span>
          {step.ingredients.map((ingredient) => (
            <div key={ingredient.id} className="flex justify-between gap-4">
              <span>{ingredient.name}</span>
              <span className="shrink-0 font-mono text-cook-muted tabular-nums">
                {ingredient.amount ?? 'vừa ăn'}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      <div className="grow" />

      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2.5">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="Bước trước"
          className="flex h-15 items-center justify-center rounded-full border-2 border-cook-line disabled:opacity-40"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        {last ? (
          <Link
            href={`/log?recipe=${recipeId}`} transitionTypes={['nav-forward']}
            className="flex h-15 items-center justify-center rounded-full bg-protein font-display text-xl font-extrabold text-cook-bg"
          >
            Xong, ăn thôi
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => go(1)}
            className="flex h-15 items-center justify-center gap-2.5 rounded-full bg-protein font-display text-xl font-extrabold text-cook-bg"
          >
            Bước tiếp theo
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </div>

      {awake ? (
        <span className="text-center text-xs text-cook-faint">Màn hình luôn sáng khi đang nấu</span>
      ) : null}
    </div>
  )
}
