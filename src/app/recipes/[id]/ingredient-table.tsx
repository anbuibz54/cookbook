'use client'

import { useState } from 'react'
import { formatQuantity } from '@/lib/units'
import { round } from '@/lib/nutrition'

/**
 * Ingredients, with the servings stepper that scales them.
 *
 * Scaling happens here rather than on the server: it is pure arithmetic on
 * numbers the page already has, and a round trip per tap would make the
 * stepper feel broken. Per-serving nutrition is deliberately NOT affected —
 * doubling a recipe does not change what one serving contains.
 */

export type IngredientRow = {
  id: string
  section: string | null
  name: string
  quantity: number | null
  quantityMax: number | null
  unit: string | null
  note: string | null
  optional: boolean
  grams: number | null
  kcal: number | null
  linked: boolean
}

export function IngredientTable({
  rows,
  baseServings,
  yieldLabel,
}: {
  rows: IngredientRow[]
  baseServings: number
  yieldLabel: string | null
}) {
  const [servings, setServings] = useState(baseServings)
  const factor = baseServings > 0 ? servings / baseServings : 1

  // Optional lines are excluded from nutrition, so they are excluded here too.
  const counted = rows.filter((r) => !r.optional)
  const totalGrams = counted.reduce((sum, r) => sum + (r.grams ?? 0) * factor, 0)
  const totalKcal = counted.reduce((sum, r) => sum + (r.kcal ?? 0) * factor, 0)
  const anyMissing = counted.some((r) => r.kcal == null)

  const step = (delta: number) => setServings((s) => Math.min(100, Math.max(1, s + delta)))

  return (
    <>
      <section className="flex items-center justify-between rounded-[18px] border border-line bg-surface py-2 pr-2 pl-4">
        <div className="flex flex-col">
          <span className="text-[13px] font-medium">Khẩu phần</span>
          <span className="text-xs text-muted">
            {yieldLabel ? `${formatQuantity(baseServings)} ${yieldLabel} theo công thức gốc` : 'Theo công thức gốc'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Bớt một phần"
            className="flex size-11 items-center justify-center rounded-xl bg-background"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
          <span aria-live="polite" className="min-w-11 text-center font-mono text-lg tabular-nums">
            {formatQuantity(servings)}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Thêm một phần"
            className="flex size-11 items-center justify-center rounded-xl bg-background"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </section>

      <section className="flex flex-col rounded-[18px] border border-line bg-surface p-4">
        <h2 className="mb-3 font-display text-[19px] font-bold">Nguyên liệu</h2>

        <div className="grid grid-cols-[minmax(0,1fr)_74px_50px_46px] gap-2 border-b border-line-soft pb-2 text-[11px] text-muted">
          <span>Tên</span>
          <span>Lượng</span>
          <span className="text-right">Gram</span>
          <span className="text-right">kcal</span>
        </div>

        {rows.map((row, i) => (
          <div key={row.id}>
            {row.section && row.section !== rows[i - 1]?.section ? (
              <div className="pt-3.5 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
                {row.section}
              </div>
            ) : null}
            <div
              className={`grid grid-cols-[minmax(0,1fr)_74px_50px_46px] items-baseline gap-2 border-b border-line-soft py-2.5 ${
                row.optional ? 'text-muted' : ''
              }`}
            >
              <span className="flex items-center gap-1.5">
                {row.name}
                {!row.optional && !row.linked ? (
                  <span
                    aria-label="chưa có số liệu dinh dưỡng"
                    className="size-[7px] shrink-0 rounded-full bg-carbs"
                  />
                ) : null}
                {row.note ? <span className="truncate text-muted">, {row.note}</span> : null}
              </span>
              <span className="text-muted">
                {row.quantity == null
                  ? 'vừa ăn'
                  : `${formatQuantity(row.quantity * factor)}${
                      row.quantityMax != null ? `–${formatQuantity(row.quantityMax * factor)}` : ''
                    }${row.unit ? ` ${row.unit}` : ''}`}
              </span>
              <span className="text-right font-mono text-[13px] tabular-nums">
                {row.grams == null ? '—' : round(row.grams * factor)}
              </span>
              <span className="text-right font-mono text-[13px] tabular-nums">
                {row.optional ? '·' : row.kcal == null ? '—' : round(row.kcal * factor)}
              </span>
            </div>
          </div>
        ))}

        <div className="grid grid-cols-[minmax(0,1fr)_50px_46px] gap-2 border-t border-ink pt-3 font-medium">
          <span>Cả mẻ</span>
          <span className="text-right font-mono text-[13px] tabular-nums">{round(totalGrams)}</span>
          <span className="text-right font-mono text-[13px] tabular-nums">{round(totalKcal)}</span>
        </div>

        {anyMissing ? (
          <p className="flex items-center gap-1.5 pt-2.5 text-xs text-muted">
            <span aria-hidden="true" className="size-[7px] rounded-full bg-carbs" />
            Chưa có số liệu, nhờ Claude liên kết thực phẩm giúp
          </p>
        ) : null}
      </section>
    </>
  )
}
