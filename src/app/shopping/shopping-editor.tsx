'use client'

import { useActionState, useState } from 'react'
import type { KitchenFormState } from '@/app/_actions/kitchen'
import { runOrQueue } from '@/lib/offline-queue'
import { AmountField, fieldClass, IngredientNameField } from '@/components/kitchen-fields'

/** " · 3 quả" for the "chờ gửi" list, when an amount was typed. */
function amountLabel(form: FormData) {
  const amount = String(form.get('amount') ?? '').trim()
  return amount ? ` · ${amount}` : ''
}

export type StoreChoice = { value: string; label: string }

function StoreSelect({
  choices,
  value,
  onChange,
  defaultValue,
}: {
  choices: StoreChoice[]
  value?: string
  onChange?: (value: string) => void
  defaultValue?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">Mua ở đâu</span>
      <select
        name="store"
        {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : { defaultValue: defaultValue ?? '' })}
        className={fieldClass}
      >
      <option value="">Chưa xếp chỗ mua</option>
      {choices.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
      </select>
    </label>
  )
}

/** "+ Thêm món cần mua": by hand, with where to buy it if you already know. */
export function ShoppingAddForm({ choices }: { choices: StoreChoice[] }) {
  const [open, setOpen] = useState(false)
  // Kept across saves: the next item is usually from the same shop.
  const [store, setStore] = useState('')
  const [state, action, pending] = useActionState<KitchenFormState & { queued?: boolean }, FormData>(async (_prev, form) => {
    const name = String(form.get('name') ?? '').trim()
    const run = await runOrQueue({ kind: 'shopping.add', label: `cần mua ${name}${amountLabel(form)}`, form })
    return run.queued ? { done: Date.now(), queued: true } : ((run.result ?? {}) as KitchenFormState)
  }, {})

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 items-center justify-center gap-2 rounded-full border-2 border-ink bg-surface font-medium shadow-pop-sm"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Thêm món cần mua
      </button>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-[18px] border-2 border-ink bg-surface p-3.5">
      <div key={state.done ?? 0} className="flex flex-col gap-3">
        <IngredientNameField autoFocus placeholder="cà chua, sữa tươi…" />
        <AmountField placeholder="1 kg, 2 bó" />
      </div>
      <StoreSelect choices={choices} value={store} onChange={setStore} />
      {state.error ? (
        <p role="alert" className="text-sm text-primary">
          {state.error}
        </p>
      ) : state.done ? (
        <p role="status" className="text-sm text-muted">
          {state.queued ? 'Đang mất mạng: đã lưu tạm trên máy, có mạng sẽ tự gửi. Nhập tiếp nhé.' : 'Đã thêm. Nhập tiếp món khác nhé.'}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full border border-line text-sm">
          Xong
        </button>
        <button type="submit" disabled={pending} className="h-11 rounded-full bg-ink text-sm font-medium text-background disabled:opacity-60">
          {pending ? 'Đang lưu…' : 'Thêm'}
        </button>
      </div>
    </form>
  )
}

export type ShoppingRowView = {
  id: string
  name: string
  amount: string
  detail: string | null
  note: string | null
  storeValue: string
}

/**
 * One open line: tick to mark bought, tap the name to change amount or shop.
 * Keyed by its values on the page, like PantryItemRow: a real change remounts
 * it with fresh data, so the editor never closes onto the old amount.
 */
export function ShoppingLineRow({ line, first, choices }: { line: ShoppingRowView; first: boolean; choices: StoreChoice[] }) {
  const [editing, setEditing] = useState(false)
  // Shown ticked at once; the server (or the offline queue) catches up.
  const [ticked, setTicked] = useState(false)
  const [state, action, pending] = useActionState<KitchenFormState, FormData>(async (prev, form) => {
    const run = await runOrQueue({ kind: 'shopping.update', itemId: line.id, label: `sửa ${line.name}${amountLabel(form)}`, form })
    if (run.queued) {
      setEditing(false)
      return { done: Date.now() }
    }
    const next = (run.result ?? {}) as KitchenFormState
    const unchanged =
      String(form.get('amount') ?? '').trim() === line.amount && String(form.get('store') ?? '') === line.storeValue
    if (next.done && unchanged) setEditing(false)
    return next
  }, {})

  const border = first ? '' : 'border-t border-line-soft'

  if (editing) {
    return (
      <li className={`py-3 ${border}`}>
        <form action={action} className="flex flex-col gap-2.5">
          <span className="font-medium">{line.name}</span>
          <AmountField defaultValue={line.amount} placeholder="1 kg, 2 bó" />
          <input type="hidden" name="note" value={line.note ?? ''} />
          <StoreSelect choices={choices} defaultValue={line.storeValue} />
          {state.error ? (
            <p role="alert" className="text-sm text-primary">
              {state.error}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => runOrQueue({ kind: 'shopping.remove', itemId: line.id, label: `bỏ ${line.name} khỏi danh sách` })}
              className="h-10 px-1 text-sm text-muted hover:text-primary"
            >
              Bỏ khỏi danh sách
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className="h-10 rounded-full border border-line px-4 text-sm">
                Hủy
              </button>
              <button type="submit" disabled={pending} className="h-10 rounded-full bg-ink px-4 text-sm text-background disabled:opacity-60">
                {pending ? 'Đang lưu…' : 'Lưu'}
              </button>
            </div>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className={`flex items-center gap-3 py-2.5 ${border} ${ticked ? 'opacity-50' : ''}`}>
      <button
        type="button"
        aria-pressed={ticked}
        disabled={ticked}
        aria-label={`Đánh dấu đã mua ${line.name}`}
        onClick={async () => {
          setTicked(true)
          try {
            await runOrQueue({
              kind: 'shopping.bought',
              itemId: line.id,
              label: `đã mua ${line.name}`,
              fields: { bought: 'true' },
            })
          } catch {
            setTicked(false)
          }
        }}
        className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-ink ${ticked ? 'bg-ink text-background' : ''}`}
      >
        {ticked ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12l5 5 9-10" />
          </svg>
        ) : null}
      </button>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Sửa ${line.name}`}
        className="flex min-w-0 grow items-center gap-3 py-0.5 text-left"
      >
        <span className="flex min-w-0 grow flex-col gap-0.5">
          <span className="truncate font-medium">{line.name}</span>
          {line.detail ? <span className="truncate text-xs text-muted">{line.detail}</span> : null}
        </span>
        <span className="shrink-0 font-mono text-[13px] text-muted tabular-nums">{line.amount}</span>
      </button>
    </li>
  )
}
