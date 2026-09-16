'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import {
  addShoppingItemAction,
  removeShoppingItemAction,
  setBoughtAction,
  updateShoppingItemAction,
  type KitchenFormState,
} from '@/app/_actions/kitchen'

export type StoreChoice = { value: string; label: string }

const input =
  'h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-[15px] outline-none placeholder:text-placeholder focus-visible:border-ink'

function StoreSelect({ choices, defaultValue, label }: { choices: StoreChoice[]; defaultValue?: string; label: string }) {
  return (
    <select name="store" defaultValue={defaultValue ?? ''} aria-label={label} className={input}>
      <option value="">Chưa xếp chỗ mua</option>
      {choices.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  )
}

/** "+ Thêm món cần mua": by hand, with where to buy it if you already know. */
export function ShoppingAddForm({ choices }: { choices: StoreChoice[] }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<KitchenFormState, FormData>(addShoppingItemAction, {})
  const form = useRef<HTMLFormElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!state.done) return
    // Keep the chosen shop: the next item is usually from the same one.
    const store = form.current?.querySelector<HTMLSelectElement>('select[name="store"]')?.value
    form.current?.reset()
    const select = form.current?.querySelector<HTMLSelectElement>('select[name="store"]')
    if (select && store) select.value = store
    nameInput.current?.focus()
  }, [state.done])

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
    <form ref={form} action={action} className="flex flex-col gap-2.5 rounded-[18px] border-2 border-ink bg-surface p-3.5">
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2.5">
        <input
          ref={nameInput}
          name="name"
          required
          maxLength={80}
          autoFocus
          autoComplete="off"
          placeholder="Tên: cà chua, sữa tươi…"
          aria-label="Tên"
          className={input}
        />
        <input name="amount" autoComplete="off" placeholder="1 kg" aria-label="Số lượng" className={input} />
      </div>
      <StoreSelect choices={choices} label="Mua ở đâu" />
      {state.error ? (
        <p role="alert" className="text-sm text-primary">
          {state.error}
        </p>
      ) : state.done ? (
        <p role="status" className="text-sm text-muted">
          Đã thêm. Nhập tiếp món khác nhé.
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
  const [state, action, pending] = useActionState<KitchenFormState, FormData>(async (prev, form) => {
    const next = await updateShoppingItemAction(line.id, prev, form)
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
          <input
            name="amount"
            defaultValue={line.amount}
            autoFocus
            autoComplete="off"
            placeholder="Lượng, ví dụ 1 kg"
            aria-label={`Lượng ${line.name}`}
            className={input}
          />
          <input type="hidden" name="note" value={line.note ?? ''} />
          <StoreSelect choices={choices} defaultValue={line.storeValue} label={`Mua ${line.name} ở đâu`} />
          {state.error ? (
            <p role="alert" className="text-sm text-primary">
              {state.error}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => removeShoppingItemAction(line.id)}
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
    <li className={`flex items-center gap-3 py-2.5 ${border}`}>
      <form action={setBoughtAction.bind(null, line.id, true)} className="flex">
        <button type="submit" aria-label={`Đánh dấu đã mua ${line.name}`} className="size-6 shrink-0 rounded-full border-2 border-ink" />
      </form>
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
