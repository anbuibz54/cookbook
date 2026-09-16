'use client'

import { useActionState, useState } from 'react'
import {
  addPantryItemAction,
  removePantryItemAction,
  updatePantryItemAction,
  type KitchenFormState,
} from '@/app/_actions/kitchen'
import { AmountField, ExpiryField, IngredientNameField } from '@/components/kitchen-fields'

/**
 * "+ Thêm đồ vào tủ": the hand-entry path, for when there is no AI to ask.
 * Stays open after saving and clears, because a trip to the market is
 * usually five things in a row.
 */
export function PantryAddForm({ today }: { today: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<KitchenFormState, FormData>(addPantryItemAction, {})

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
        Thêm đồ vào tủ
      </button>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-[18px] border-2 border-ink bg-surface p-3.5">
      {/* Remounted after each save, which clears the fields for the next item. */}
      <div key={state.done ?? 0} className="flex flex-col gap-3">
        <IngredientNameField autoFocus placeholder="trứng gà, hành lá, thịt ba chỉ…" />
        <AmountField />
        <ExpiryField today={today} />
      </div>
      <p className="text-xs text-pretty text-muted">Đã có trong tủ thì cộng dồn khi cùng đơn vị.</p>
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

export type PantryRowView = {
  id: string
  name: string
  amount: string
  expiresOn: string | null
  expiry: { label: string; urgent: boolean } | null
  note: string | null
}

/**
 * One pantry line. Tap to edit its amount and date in place.
 *
 * The page keys this row by its values, so a save that changes something
 * remounts it with the fresh data and the editor closes on its own — closing
 * it in the action instead showed the OLD amount for the half second before
 * the refreshed page arrived. A save that changes nothing closes here.
 */
export function PantryItemRow({ item, first, today }: { item: PantryRowView; first: boolean; today: string }) {
  const [editing, setEditing] = useState(false)
  const [state, action, pending] = useActionState<KitchenFormState, FormData>(async (prev, form) => {
    const next = await updatePantryItemAction(item.id, prev, form)
    const unchanged =
      String(form.get('amount') ?? '').trim() === item.amount && String(form.get('expiresOn') ?? '') === (item.expiresOn ?? '')
    if (next.done && unchanged) setEditing(false)
    return next
  }, {})

  const border = first ? '' : 'border-t border-line-soft'

  if (editing) {
    return (
      <li className={`py-3 ${border}`}>
        <form action={action} className="flex flex-col gap-2.5">
          <span className="font-medium">{item.name}</span>
          <input type="hidden" name="note" value={item.note ?? ''} />
          <AmountField defaultValue={item.amount} placeholder="3 quả, 500 g" />
          <ExpiryField today={today} defaultValue={item.expiresOn} />
          {state.error ? (
            <p role="alert" className="text-sm text-primary">
              {state.error}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={async () => {
                if (window.confirm(`Bỏ ${item.name} khỏi tủ?`)) await removePantryItemAction(item.id)
              }}
              className="h-10 px-1 text-sm text-muted hover:text-primary"
            >
              Bỏ khỏi tủ
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
    <li className={border}>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Sửa ${item.name}`}
        className="flex w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium">{item.name}</span>
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-mono">{item.amount || 'còn'}</span>
            {item.expiry ? (
              <span className={`rounded-full px-2 py-px ${item.expiry.urgent ? 'bg-primary text-white' : 'bg-warn-bg text-warn-ink'}`}>
                {item.expiry.label}
              </span>
            ) : null}
            {item.note ? <span className="truncate">{item.note}</span> : null}
          </span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-placeholder">
          <path d="M4 20h4L19 9l-4-4L4 16z" />
        </svg>
      </button>
    </li>
  )
}
