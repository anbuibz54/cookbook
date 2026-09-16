/**
 * The amount box on the meal log: one text field instead of number + unit
 * pickers, because on a phone "400 g", "2 quả", "nửa bó" and "hết" are all
 * faster to type than to pick.
 */

import { canonicalUnit, formatQuantity } from './units'

export type Amount =
  | { kind: 'none' }
  /** The whole pantry item is gone. */
  | { kind: 'all' }
  | { kind: 'measured'; quantity: number; unit: string | null }
  /** Words without a number ("một ít"): kept as written, never subtracted. */
  | { kind: 'text'; text: string }

const GLYPHS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }

export function parseAmount(input: string | null | undefined): Amount {
  const text = (input ?? '').trim().replace(/\s+/g, ' ')
  if (!text) return { kind: 'none' }

  const lower = text.toLowerCase()
  if (/^(hết|het|dùng hết|dung het|all)$/.test(lower)) return { kind: 'all' }

  const half = lower.match(/^(nửa|nua)\s*(.*)$/)
  if (half) return { kind: 'measured', quantity: 0.5, unit: canonicalUnit(half[2]) }

  const m = lower.match(/^(\d+(?:[.,]\d+)?)?\s*([¼½¾⅓⅔])?(?:\s*\/\s*(\d+))?\s*(.*)$/)
  if (m && (m[1] || m[2])) {
    let quantity = m[1] ? Number(m[1].replace(',', '.')) : 0
    if (m[3] && m[1]) quantity = quantity / Number(m[3])
    if (m[2]) quantity += GLYPHS[m[2]]
    if (Number.isFinite(quantity) && quantity > 0) {
      return { kind: 'measured', quantity, unit: canonicalUnit(m[4]) }
    }
  }

  return { kind: 'text', text }
}

export function formatAmount(quantity: number | null | undefined, unit: string | null | undefined): string {
  if (quantity == null) return ''
  return unit ? `${formatQuantity(quantity)} ${unit}` : formatQuantity(quantity)
}
