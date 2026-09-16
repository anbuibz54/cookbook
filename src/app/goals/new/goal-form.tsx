'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { createGoalAction } from '@/app/_actions/motivation'

const METRICS = [
  { value: 'meals', label: 'Số bữa nấu' },
  { value: 'new_dishes', label: 'Món mới chinh phục' },
  { value: 'tagged', label: 'Món theo tag' },
] as const

const inputClass =
  'h-[50px] rounded-[14px] border border-line bg-surface px-3.5 text-base outline-none placeholder:text-placeholder focus-visible:border-ink'

/** A long-term goal: a count over a date range, counted from the journal. */
export function GoalForm({
  today,
  monthEnd,
  month,
  tags,
}: {
  today: string
  monthEnd: string
  month: number
  tags: string[]
}) {
  const [state, formAction, pending] = useActionState(createGoalAction, {})
  const [metric, setMetric] = useState<(typeof METRICS)[number]['value']>('meals')

  return (
    <form action={formAction} className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-[18px] pt-3 pb-10">
      <header className="grid h-13 grid-cols-[64px_minmax(0,1fr)_64px] items-center">
        <Link href="/achievements" transitionTypes={['nav-back']} className="py-3 text-muted hover:text-ink">
          Hủy
        </Link>
        <h1 className="text-center font-display text-xl font-extrabold">Mục tiêu mới</h1>
      </header>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Tên</span>
        <input
          name="title"
          required
          maxLength={80}
          placeholder={`Tháng ${month} nấu 20 bữa`}
          className="h-[50px] rounded-[14px] border-2 border-ink bg-surface px-3.5 text-base outline-none placeholder:text-placeholder"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 text-[13px] font-medium">Đếm gì</legend>
        <div className="flex flex-wrap gap-2">
          {METRICS.map((m) => (
            <label
              key={m.value}
              className={`flex h-[38px] cursor-pointer items-center rounded-full px-3.5 text-sm has-focus-visible:outline-2 ${
                metric === m.value ? 'bg-ink text-background' : 'border border-line bg-surface'
              }`}
            >
              <input
                type="radio"
                name="metric"
                value={m.value}
                checked={metric === m.value}
                onChange={() => setMetric(m.value)}
                className="sr-only"
              />
              {m.label}
            </label>
          ))}
        </div>
        {metric === 'tagged' ? (
          tags.length ? (
            <select name="tag" required defaultValue="" aria-label="Tag" className={inputClass}>
              <option value="" disabled>
                Chọn tag
              </option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-muted">Sổ chưa có công thức nào gắn tag.</p>
          )
        ) : null}
        <p className="text-xs text-pretty text-muted">
          {metric === 'meals'
            ? 'Mỗi bữa ghi trong nhật ký tính 1.'
            : metric === 'new_dishes'
              ? 'Món chưa từng có trong nhật ký tính 1.'
              : 'Mỗi công thức mang tag này được nấu trong khoảng thời gian tính 1.'}
        </p>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Con số</span>
        <input
          name="target"
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          required
          defaultValue={20}
          className={`${inputClass} font-mono`}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] font-medium">Từ ngày</span>
          <input name="startsOn" type="date" required defaultValue={today} className={`${inputClass} min-w-0 font-mono text-sm`} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] font-medium">Đến ngày</span>
          <input name="endsOn" type="date" required defaultValue={monthEnd} className={`${inputClass} min-w-0 font-mono text-sm`} />
        </label>
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
        {pending ? 'Đang lưu…' : 'Thêm mục tiêu'}
      </button>
    </form>
  )
}
