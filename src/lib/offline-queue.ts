'use client'

/**
 * Kitchen changes made without a connection — at the market, in a basement
 * Bách Hóa Xanh — are kept on the phone and sent when the network is back.
 *
 * Scope on purpose: pantry and shopping-list edits only. They are small,
 * replay-safe enough, and the moment they happen is exactly when signal is
 * worst. Meal logging (photos, pantry maths across items) stays online-only.
 *
 * Stored in localStorage: a handful of short JSON ops, and it has to survive
 * the app being closed. Every access is guarded — storage can be missing or
 * throw (private mode), and then changes simply are not queued.
 *
 * Replay is in order, one at a time. An op the server rejects (item deleted
 * elsewhere, bad input) is dropped and reported, so one bad op never blocks
 * the rest. Known limit: if a request reached the server but the reply was
 * lost, replay can apply it twice (an add then adds up twice).
 */

import {
  addPantryItemAction,
  addShoppingItemAction,
  removePantryItemAction,
  removeShoppingItemAction,
  setBoughtAction,
  updatePantryItemAction,
  updateShoppingItemAction,
  type KitchenFormState,
} from '@/app/_actions/kitchen'

export type OpKind =
  | 'pantry.add'
  | 'pantry.update'
  | 'pantry.remove'
  | 'shopping.add'
  | 'shopping.update'
  | 'shopping.bought'
  | 'shopping.remove'

export type Op = {
  id: string
  kind: OpKind
  /** Short human description for the "chờ gửi" list. */
  label: string
  itemId?: string
  fields?: Record<string, string>
  at: number
}

const KEY = 'cookbook-offline-queue'
const EVENT = 'cookbook-offline-queue'

export function readQueue(): Op[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Op[]) : []
  } catch {
    return []
  }
}

function writeQueue(ops: Op[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops))
    window.dispatchEvent(new Event(EVENT))
    return true
  } catch {
    return false
  }
}

export function onQueueChange(listener: () => void) {
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

/** Offline, or a request that died on the network rather than on the server. */
export function isNetworkFailure(error: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const message = error instanceof Error ? error.message : String(error)
  return error instanceof TypeError || /fetch|network|load failed|connection/i.test(message)
}

function formFields(form: FormData | undefined) {
  if (!form) return undefined
  const fields: Record<string, string> = {}
  for (const [k, v] of form.entries()) if (typeof v === 'string') fields[k] = v
  return fields
}

function toForm(fields: Record<string, string> | undefined) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields ?? {})) form.set(k, v)
  return form
}

async function execute(op: Op): Promise<KitchenFormState | void> {
  const form = toForm(op.fields)
  switch (op.kind) {
    case 'pantry.add':
      return addPantryItemAction({}, form)
    case 'pantry.update':
      return updatePantryItemAction(op.itemId!, {}, form)
    case 'pantry.remove':
      return removePantryItemAction(op.itemId!)
    case 'shopping.add':
      return addShoppingItemAction({}, form)
    case 'shopping.update':
      return updateShoppingItemAction(op.itemId!, {}, form)
    case 'shopping.bought':
      return setBoughtAction(op.itemId!, op.fields?.bought !== 'false')
    case 'shopping.remove':
      return removeShoppingItemAction(op.itemId!)
  }
}

export type RunResult = { queued: true } | { queued: false; result: KitchenFormState | void }

/**
 * Run a kitchen change now, or keep it for later when there is no network.
 * Returns what the server said, or `queued` when it was stored instead.
 */
export async function runOrQueue(input: Omit<Op, 'id' | 'at'> & { form?: FormData }): Promise<RunResult> {
  const { form, ...rest } = input
  const op: Op = { ...rest, fields: rest.fields ?? formFields(form), id: crypto.randomUUID(), at: Date.now() }

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      return { queued: false, result: await execute(op) }
    } catch (error) {
      if (!isNetworkFailure(error)) throw error
    }
  }
  if (!writeQueue([...readQueue(), op])) throw new Error('Không lưu tạm được trên máy này.')
  return { queued: true }
}

let flushing = false

/**
 * Send queued ops in order. Stops at the first network failure (still
 * offline); drops ops the server rejected. Returns how many were sent and the
 * labels of rejected ones.
 */
export async function flushQueue(): Promise<{ sent: number; rejected: string[]; left: number }> {
  if (flushing) return { sent: 0, rejected: [], left: readQueue().length }
  flushing = true
  let sent = 0
  const rejected: string[] = []
  try {
    for (;;) {
      const [op] = readQueue()
      if (!op) break
      try {
        const result = await execute(op)
        if (result && 'error' in result && result.error) rejected.push(`${op.label}: ${result.error}`)
        else sent++
      } catch (error) {
        if (isNetworkFailure(error)) break
        rejected.push(op.label)
      }
      writeQueue(readQueue().filter((o) => o.id !== op.id))
    }
  } finally {
    flushing = false
  }
  return { sent, rejected, left: readQueue().length }
}
