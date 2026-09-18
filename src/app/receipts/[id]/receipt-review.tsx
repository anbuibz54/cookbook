'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { applyReceiptAction, type ApplyReceiptState } from '@/app/_actions/receipts'

type Line = {
  id: string
  rawText: string | null
  name: string
  amount: string
  priceVnd: number | null
  kind: string
  toPantry: boolean
  shoppingItemId: string | null
  forBakery: boolean
}

const STORE_KINDS = [
  ['bhx', 'Bách Hóa Xanh'],
  ['sieu_thi', 'Siêu thị'],
  ['cho', 'Chợ'],
  ['online', 'Online'],
] as const

const field = 'h-10 w-full min-w-0 rounded-xl border border-line bg-background px-3 text-sm focus-visible:border-ink focus-visible:outline-none'

/**
 * The cook checks what the AI read before anything touches the kitchen: rename
 * a line, fix an amount, untick what should not go in the fridge, pick which
 * shopping-list line a purchase ticks, and mark what was bought for the bakery.
 */
export function ReceiptReview({
  receipt,
  lines: initial,
  shopping,
}: {
  receipt: { id: string; storeName: string; storeKind: string | null; boughtOn: string; totalVnd: number | null; applied: boolean }
  lines: Line[]
  shopping: { id: string; name: string }[]
}) {
  const [state, action, pending] = useActionState<ApplyReceiptState, FormData>(applyReceiptAction, null)
  const [lines, setLines] = useState(initial)
  const [header, setHeader] = useState({ storeName: receipt.storeName, storeKind: receipt.storeKind ?? '', boughtOn: receipt.boughtOn })
  const set = (id: string, patch: Partial<Line>) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const done = receipt.applied || (state !== null && 'ok' in state)

  const sum = lines.reduce((s, l) => s + (l.priceVnd ?? 0), 0)
  const gap = receipt.totalVnd != null ? receipt.totalVnd - sum : null
  const allBakery = lines.filter((l) => l.kind === 'food').every((l) => l.forBakery)

  const payload = JSON.stringify({
    storeName: header.storeName || null,
    storeKind: header.storeKind || null,
    boughtOn: header.boughtOn,
    lines: lines.map((l) => ({
      id: l.id,
      name: l.name,
      amount: l.amount,
      priceVnd: l.priceVnd,
      toPantry: l.toPantry,
      shoppingItemId: l.shoppingItemId,
      forBakery: l.forBakery,
    })),
  })

  if (state && 'ok' in state) {
    const r = state.ok
    return (
      <section role="status" className="flex flex-col gap-3 rounded-[20px] border-2 border-ink bg-tile-mint p-5 shadow-pop-sm">
        <p className="font-display text-xl font-extrabold">Đã vào tủ lạnh</p>
        {r.added.length > 0 && <p className="text-sm">Thêm mới: {r.added.join(', ')}.</p>}
        {r.increased.length > 0 && <p className="text-sm">Cộng thêm: {r.increased.join(', ')}.</p>}
        {r.ticked.length > 0 && <p className="text-sm">Đã tick đi chợ: {r.ticked.join(', ')}.</p>}
        {r.forBakery > 0 && <p className="text-sm">{r.forBakery} giá gửi sang tiệm bánh — vào trang Nguyên liệu của tiệm để nhập.</p>}
        <div className="flex gap-2">
          <Link href="/pantry" className="rounded-full border-2 border-ink bg-surface px-4 py-2 text-sm font-medium">
            Xem tủ lạnh
          </Link>
          <Link href="/shopping" className="rounded-full border-2 border-ink bg-surface px-4 py-2 text-sm font-medium">
            Xem đi chợ
          </Link>
        </div>
      </section>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="receiptId" value={receipt.id} />
      <input type="hidden" name="payload" value={payload} />

      <section className="grid grid-cols-2 gap-2.5 rounded-[18px] border border-line bg-surface p-3.5">
        <label className="col-span-2 text-xs font-medium text-muted">
          Nơi mua
          <input value={header.storeName} onChange={(e) => setHeader({ ...header, storeName: e.target.value })} disabled={done} className={`${field} mt-1`} />
        </label>
        <label className="text-xs font-medium text-muted">
          Loại
          <select value={header.storeKind} onChange={(e) => setHeader({ ...header, storeKind: e.target.value })} disabled={done} className={`${field} mt-1`}>
            <option value="">—</option>
            {STORE_KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-muted">
          Ngày mua
          <input type="date" value={header.boughtOn} onChange={(e) => setHeader({ ...header, boughtOn: e.target.value })} disabled={done} className={`${field} mt-1`} />
        </label>
      </section>

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold">{lines.length} món</h2>
        {!done && (
          <button
            type="button"
            onClick={() => setLines(lines.map((l) => (l.kind === 'food' ? { ...l, forBakery: !allBakery } : l)))}
            className="text-[13px] text-primary underline underline-offset-4"
          >
            {allBakery ? 'Bỏ hết khỏi tiệm bánh' : 'Tất cả là của tiệm bánh'}
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-2.5">
        {lines.map((l) => (
          <li key={l.id} className={`flex flex-col gap-2 rounded-[18px] border bg-surface p-3 ${l.toPantry ? 'border-line' : 'border-dashed border-line opacity-80'}`}>
            {l.rawText && <p className="font-mono text-[11px] text-muted">{l.rawText}</p>}
            <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
              <input aria-label="Tên" value={l.name} onChange={(e) => set(l.id, { name: e.target.value })} disabled={done} className={field} />
              <input aria-label="Lượng" value={l.amount} onChange={(e) => set(l.id, { amount: e.target.value })} placeholder="500 g" disabled={done} className={field} />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_112px] items-center gap-2">
              <select
                aria-label="Tick trong danh sách đi chợ"
                value={l.shoppingItemId ?? ''}
                onChange={(e) => set(l.id, { shoppingItemId: e.target.value || null })}
                disabled={done}
                className={field}
              >
                <option value="">Không tick đi chợ</option>
                {shopping.map((s) => (
                  <option key={s.id} value={s.id}>
                    Tick: {s.name}
                  </option>
                ))}
              </select>
              <label className="relative">
                <span className="sr-only">Thành tiền</span>
                <input
                  inputMode="numeric"
                  value={l.priceVnd ?? ''}
                  onChange={(e) => {
                    const n = e.target.value.replace(/\D/g, '')
                    set(l.id, { priceVnd: n ? Number(n) : null })
                  }}
                  disabled={done}
                  className={`${field} pr-6 text-right tabular-nums`}
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted">đ</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={l.toPantry} onChange={(e) => set(l.id, { toPantry: e.target.checked })} disabled={done} className="size-4 accent-primary" />
                Vào tủ lạnh
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={l.forBakery} onChange={(e) => set(l.id, { forBakery: e.target.checked })} disabled={done} className="size-4 accent-primary" />
                Giá cho tiệm bánh
              </label>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-sm tabular-nums">
        Cộng các dòng: <b>{sum.toLocaleString('vi-VN')}đ</b>
        {receipt.totalVnd != null && (
          <>
            {' '}
            · hóa đơn ghi <b>{receipt.totalVnd.toLocaleString('vi-VN')}đ</b>
            {gap != null && Math.abs(gap) >= 1000 && <span className="text-warn-ink"> · lệch {Math.abs(gap).toLocaleString('vi-VN')}đ, kiểm lại giá nhé</span>}
          </>
        )}
      </p>

      {state && 'error' in state && (
        <p role="alert" className="rounded-[18px] border-2 border-ink bg-warn-bg px-4 py-3 text-sm text-warn-ink">
          {state.error}
        </p>
      )}

      {done ? (
        <p className="rounded-[18px] border border-line bg-surface px-4 py-3 text-sm text-muted">Hóa đơn này đã vào tủ lạnh rồi.</p>
      ) : (
        <button type="submit" disabled={pending} className="h-13 rounded-full border-2 border-ink bg-primary font-display text-lg font-extrabold text-white shadow-pop disabled:opacity-60">
          {pending ? 'Đang cất vào tủ…' : 'Cất vào tủ & tick đi chợ'}
        </button>
      )}
    </form>
  )
}
