'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import type { FormState } from '@/app/_actions/motivation'

type Values = {
  name: string
  kind: 'daily' | 'daily_rest' | 'weekly'
  restPerWeek: number
  timesPerWeek: number
  trigger: 'tick' | 'any_meal' | 'new_dish'
  remindAt: string | null
}

const KINDS: { value: Values['kind']; label: string; hint: string }[] = [
  { value: 'daily', label: 'Mỗi ngày, liên tục', hint: 'Bỏ một ngày là chuỗi về 0.' },
  { value: 'daily_rest', label: 'Mỗi ngày, có ngày nghỉ', hint: 'Ốm, đi ăn ngoài vẫn giữ được chuỗi.' },
  { value: 'weekly', label: 'Vài lần mỗi tuần', hint: 'Tính theo tuần, không theo ngày. Ví dụ món mới 1 lần/tuần.' },
]

const TRIGGERS: { value: Values['trigger']; label: string }[] = [
  { value: 'tick', label: 'Mình tick khi ghi bữa' },
  { value: 'any_meal', label: 'Có ghi bữa bất kỳ' },
  { value: 'new_dish', label: 'Nấu món chưa từng nấu' },
]

function Stepper({ name, value, min, max, onChange }: { name: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <span className="inline-flex items-center rounded-[10px] border border-line bg-surface">
      <input type="hidden" name={name} value={value} />
      <button type="button" aria-label="Bớt" disabled={value <= min} onClick={() => onChange(value - 1)} className="size-9 disabled:opacity-30">
        −
      </button>
      <span className="min-w-5 text-center font-mono">{value}</span>
      <button type="button" aria-label="Thêm" disabled={value >= max} onClick={() => onChange(value + 1)} className="size-9 disabled:opacity-30">
        +
      </button>
    </span>
  )
}

/** Create or edit a streak. The strictness is per streak, chosen here. */
export function StreakForm({
  initial,
  action,
  title,
  submitLabel,
}: {
  initial: Values
  action: (prev: FormState, form: FormData) => Promise<FormState>
  title: string
  submitLabel: string
}) {
  const [state, formAction, pending] = useActionState(action, {})
  const [kind, setKind] = useState(initial.kind)
  const [rest, setRest] = useState(initial.restPerWeek)
  const [times, setTimes] = useState(initial.timesPerWeek)
  const [trigger, setTrigger] = useState(initial.trigger)
  const [remind, setRemind] = useState(initial.remindAt != null)

  return (
    <form action={formAction} className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-[18px] pt-3 pb-10">
      <header className="grid h-13 grid-cols-[64px_minmax(0,1fr)_64px] items-center">
        <Link href="/achievements" transitionTypes={['nav-back']} className="py-3 text-muted hover:text-ink">
          Hủy
        </Link>
        <h1 className="text-center font-display text-xl font-extrabold">{title}</h1>
      </header>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Tên</span>
        <input
          name="name"
          defaultValue={initial.name}
          required
          maxLength={60}
          placeholder="Nấu cơm cho vợ"
          className="h-[50px] rounded-[14px] border-2 border-ink bg-surface px-3.5 text-base outline-none placeholder:text-placeholder"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 text-[13px] font-medium">Kiểu</legend>
        {KINDS.map((k) => {
          const active = kind === k.value
          return (
            <label
              key={k.value}
              className={`grid cursor-pointer grid-cols-[24px_minmax(0,1fr)] items-start gap-2.5 rounded-2xl bg-surface px-3.5 py-3 ${
                active ? 'border-2 border-ink' : 'border border-line'
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={k.value}
                checked={active}
                onChange={() => setKind(k.value)}
                className="mt-1 size-4 accent-[var(--primary)]"
              />
              <span className="flex flex-col gap-2">
                <span className="flex flex-col">
                  <span className="font-medium">{k.label}</span>
                  <span className="text-xs text-muted">{k.hint}</span>
                </span>
                {active && k.value === 'daily_rest' ? (
                  <span className="flex items-center gap-2 text-sm">
                    Nghỉ được <Stepper name="restPerWeek" value={rest} min={1} max={3} onChange={setRest} /> ngày / tuần
                  </span>
                ) : null}
                {active && k.value === 'weekly' ? (
                  <span className="flex items-center gap-2 text-sm">
                    <Stepper name="timesPerWeek" value={times} min={1} max={7} onChange={setTimes} /> lần / tuần
                  </span>
                ) : null}
              </span>
            </label>
          )
        })}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 text-[13px] font-medium">Tính là đã làm khi</legend>
        <div className="flex flex-wrap gap-2">
          {TRIGGERS.map((t) => (
            <label
              key={t.value}
              className={`flex h-[38px] cursor-pointer items-center rounded-full px-3.5 text-sm has-focus-visible:outline-2 ${
                trigger === t.value ? 'bg-ink text-background' : 'border border-line bg-surface'
              }`}
            >
              <input
                type="radio"
                name="trigger"
                value={t.value}
                checked={trigger === t.value}
                onChange={() => setTrigger(t.value)}
                className="sr-only"
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <label htmlFor="remind" className="flex min-w-40 grow flex-col">
            <span className="font-medium">Nhắc nếu chưa làm</span>
            <span className="text-xs text-muted">Đã làm trong ngày thì không nhắc.</span>
          </label>
          <div className="flex shrink-0 items-center gap-2.5">
            <input
              type="time"
              name="remindAt"
              defaultValue={initial.remindAt ?? '17:00'}
              disabled={!remind}
              aria-label="Giờ nhắc"
              className="h-10 rounded-[10px] border border-line px-2 font-mono disabled:opacity-40"
            />
            <input
              id="remind"
              type="checkbox"
              name="remind"
              checked={remind}
              onChange={(e) => setRemind(e.target.checked)}
              className="size-5 accent-[var(--protein)]"
            />
          </div>
        </div>
        <p className="text-xs text-pretty text-muted">
          Giờ nhắc được lưu ngay; thông báo trên điện thoại sẽ bật khi làm xong phần nhắc nhở.
        </p>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-primary">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex h-14 items-center justify-center rounded-full border-2 border-ink bg-ink font-display text-xl font-extrabold text-background shadow-pop-primary disabled:opacity-60"
      >
        {pending ? 'Đang lưu…' : submitLabel}
      </button>
    </form>
  )
}
