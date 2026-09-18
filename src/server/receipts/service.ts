/**
 * Shopping receipts: photo → lines → pantry + shopping list (+ bakery prices).
 *
 * Same division of labour as the meal log. The model only READS the receipt
 * and proposes lines; the app decides what they match (shopping list, pantry)
 * with its own rules; the cook confirms before anything changes. A receipt is
 * applied exactly once — the `applied_at` claim is a conditional update.
 *
 * Lines flagged `forBakery` are how the bakery learns what flour and butter
 * cost: the bakery repo reads applied lines from this schema (read-only).
 *
 * No `next/*` imports.
 */

import { generateText, Output } from 'ai'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db'
import { pantryItems, receiptLines, receipts, shoppingItems } from '../db/schema'
import { savePantryItems } from '../pantry/service'
import { STORE_KINDS, type StoreKind } from '../shopping/service'
import { parseAmount } from '@/lib/amount'
import { vnDate } from '@/lib/dates'
import { matchKey } from '@/lib/match'
import { canonicalUnit, formatQuantity } from '@/lib/units'
import { activeModel, providerOptions } from '../ai/providers'
import { NoProviderError } from '../ai/meal'

export class ReceiptError extends Error {}

const MAX_LINES = 60

/* -------------------------------------------------------------------------- */
/* Reading a photo                                                             */
/* -------------------------------------------------------------------------- */

// Every field required, nullable instead of optional (Azure strict mode).
const schema = z.object({
  store: z.string().nullable().describe('Tên cửa hàng in trên hóa đơn, ví dụ "Bách Hóa Xanh Nguyễn Thị Thập". Không rõ thì null.'),
  date: z.string().nullable().describe('Ngày mua, dạng YYYY-MM-DD. Không rõ thì null.'),
  total_vnd: z.number().nullable().describe('Tổng tiền phải trả, số nguyên đồng. Không rõ thì null.'),
  lines: z
    .array(
      z.object({
        raw: z.string().describe('Dòng in trên hóa đơn, chép nguyên văn.'),
        name: z.string().describe('Tên chung, ngắn, như người nấu gọi: "trứng gà", "sữa tươi không đường", "cà chua". Không ghi quy cách, số lượng, nhãn hiệu (trừ nguyên liệu làm bánh như "bơ lạt Anchor"). Trùng tên trong danh sách "tên đang dùng" thì dùng đúng tên đó.'),
        quantity: z.number().nullable().describe('Số lượng hoặc khối lượng đã mua. Không rõ thì null.'),
        unit: z.string().nullable().describe('Đơn vị: g, kg, ml, l, quả, hộp, gói, bó, cái, chai. Không rõ thì null.'),
        price_vnd: z.number().nullable().describe('Thành tiền của dòng (đã trừ giảm giá nếu giảm giá in ngay dưới dòng đó), số nguyên đồng.'),
        kind: z.enum(['food', 'other']).describe('"food" nếu là đồ ăn, gia vị, nguyên liệu; "other" nếu là túi, đồ gia dụng, hóa mỹ phẩm.'),
      }),
    )
    .describe('Các món hàng trên hóa đơn, theo thứ tự in.'),
  comment: z.string().nullable().describe('Một câu nếu ảnh mờ, bị cắt, hoặc không phải hóa đơn. Không thì null.'),
})

const INSTRUCTIONS = `Bạn đọc hóa đơn mua hàng ở Việt Nam (Bách Hóa Xanh, Co.op, WinMart, chợ, cửa hàng nguyên liệu làm bánh) và chép lại từng món.

Quy tắc:
- Chỉ chép những gì in trên hóa đơn. Không đoán món không thấy. Ảnh mờ chỗ nào thì bỏ dòng đó và nói trong "comment".
- Tiền Việt dùng dấu chấm ngăn hàng nghìn: "45.000" là 45000. Trả số nguyên.
- Hàng cân ký thường in "0.512 KG" hoặc "512 G": quantity 0.512, unit "kg".
- Hàng đếm in "SL 2" hoặc "x2": quantity 2, unit theo quy cách (hộp, gói, quả...). Nếu tên có quy cách như "Trứng gà hộp 10" thì quantity 10, unit "quả" nhân với số hộp.
- Nếu tên có khối lượng hoặc thể tích ("BO ANCHOR 227G", "DUONG 1KG", "SUA 1L") thì dùng nó làm quantity + unit (227 g, 1 kg, 1 l), nhân với số lượng mua — không ghi "1 hộp" hay "1 gói".
- Dòng giảm giá / khuyến mãi in ngay dưới một món: trừ vào thành tiền món đó, không tạo dòng riêng. Giảm giá chung cho cả hóa đơn thì bỏ qua.
- Không tạo dòng cho tổng tiền, tiền thối, VAT, điểm tích lũy.
- "name" là tên người nấu hiểu, bỏ mã hàng, chữ viết tắt, nhãn hiệu và quy cách ("BA CHI HEO VISSAN 500G" → "thịt ba chỉ", "SUA TUOI VNM KHONG DUONG 1L" → "sữa tươi không đường"). Giữ nhãn hiệu chỉ với nguyên liệu làm bánh (bơ, kem, phô mai, bột).
- Người dùng gửi kèm "tên đang dùng" (tủ lạnh và danh sách đi chợ). Món nào là cùng thứ thì dùng ĐÚNG tên đó, để app cộng dồn và tick đúng. Không cùng thứ thì đừng ép tên.
- Viết tiếng Việt có dấu.`

export type ParsedReceipt = {
  storeName: string | null
  storeKind: StoreKind | null
  boughtOn: string
  totalVnd: number | null
  lines: { rawText: string; name: string; quantity: number | null; unit: string | null; priceVnd: number | null; kind: 'food' | 'other' }[]
  comment: string | null
}

/** "Bách Hóa Xanh …" → bhx, supermarkets → sieu_thi. Only when obvious. */
export function guessStoreKind(name: string | null): StoreKind | null {
  const n = (name ?? '').toLowerCase()
  if (!n) return null
  if (/bách hóa xanh|bach hoa xanh|\bbhx\b/.test(n)) return 'bhx'
  if (/co\.?op|winmart|vinmart|lotte|aeon|go!|big c|mm mega|emart|mega market|satra|kingfoodmart/.test(n)) return 'sieu_thi'
  if (/\bchợ\b|\bcho\b/.test(n)) return 'cho'
  if (/shopee|lazada|tiki|grab|online/.test(n)) return 'online'
  return null
}

export async function readReceiptPhoto(db: Db, userId: string, photo: { data: Uint8Array; mediaType: string }): Promise<ParsedReceipt> {
  const ai = await activeModel(db, userId)
  if (!ai) throw new NoProviderError()

  // The names already in the kitchen, so the model reuses them and the pantry
  // adds up instead of growing a second "trứng gà hộp 10 quả" row.
  const [pantryNames, shoppingNames] = await Promise.all([
    db.select({ name: pantryItems.name }).from(pantryItems).where(eq(pantryItems.userId, userId)),
    db.select({ name: shoppingItems.name }).from(shoppingItems).where(and(eq(shoppingItems.userId, userId), isNull(shoppingItems.boughtAt))),
  ])
  const known = [...new Set([...pantryNames, ...shoppingNames].map((r) => r.name))].slice(0, 120)

  const { output } = await generateText({
    model: ai.model,
    instructions: INSTRUCTIONS,
    output: Output.object({ schema }),
    providerOptions: providerOptions(ai.kind),
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(90_000),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [`Hôm nay là ${vnDate()}. Chép hóa đơn trong ảnh.`, '', 'Tên đang dùng:', ...(known.length ? known.map((n) => `- ${n}`) : ['(chưa có)'])].join('\n'),
          },
          { type: 'file', mediaType: photo.mediaType, data: photo.data },
        ],
      },
    ],
  })

  return cleanParsed({
    storeName: output.store,
    date: output.date,
    totalVnd: output.total_vnd,
    lines: output.lines.map((l) => ({ rawText: l.raw, name: l.name, quantity: l.quantity, unit: l.unit, priceVnd: l.price_vnd, kind: l.kind })),
    comment: output.comment,
  })
}

/** Guards for whatever the model (or Claude over MCP) sent. */
export function cleanParsed(raw: {
  storeName: string | null
  date: string | null
  totalVnd: number | null
  lines: { rawText?: string | null; name: string; quantity: number | null; unit: string | null; priceVnd: number | null; kind?: 'food' | 'other' | null }[]
  comment?: string | null
}): ParsedReceipt {
  const today = vnDate()
  const date = raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && raw.date <= today ? raw.date : today
  const money = (v: number | null) => (v != null && Number.isFinite(v) && v >= 0 && v < 1_000_000_000 ? Math.round(v) : null)
  return {
    storeName: raw.storeName?.trim() || null,
    storeKind: guessStoreKind(raw.storeName),
    boughtOn: date,
    totalVnd: money(raw.totalVnd),
    lines: raw.lines
      .map((l) => ({
        rawText: (l.rawText ?? '').trim(),
        name: l.name.trim(),
        quantity: l.quantity != null && Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : null,
        unit: canonicalUnit(l.unit),
        priceVnd: money(l.priceVnd),
        kind: l.kind === 'other' ? ('other' as const) : ('food' as const),
      }))
      .filter((l) => l.name)
      .slice(0, MAX_LINES),
    comment: raw.comment?.trim() || null,
  }
}

/* -------------------------------------------------------------------------- */
/* Drafts                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Which open shopping line does a purchase tick off? One direction only, same
 * as the meal log: buying "hành lá tươi" ticks "hành lá", buying "hành" does
 * not tick "hành tây".
 */
function shoppingMatch(lineKey: string, open: { id: string; matchKey: string }[], taken: Set<string>) {
  return open.find((s) => !taken.has(s.id) && (lineKey === s.matchKey || lineKey.startsWith(`${s.matchKey} `)))
}

export async function createReceipt(
  db: Db,
  userId: string,
  parsed: ParsedReceipt,
  opts: { photoPath: string | null; source: 'photo' | 'mcp' | 'hand'; forBakery?: boolean },
): Promise<string> {
  const open = await db
    .select({ id: shoppingItems.id, matchKey: shoppingItems.matchKey })
    .from(shoppingItems)
    .where(and(eq(shoppingItems.userId, userId), isNull(shoppingItems.boughtAt)))
  const taken = new Set<string>()

  return db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(receipts)
      .values({
        userId,
        storeName: parsed.storeName,
        storeKind: parsed.storeKind,
        boughtOn: parsed.boughtOn,
        totalVnd: parsed.totalVnd,
        photoPath: opts.photoPath,
        source: opts.source,
      })
      .returning({ id: receipts.id })

    if (parsed.lines.length) {
      await tx.insert(receiptLines).values(
        parsed.lines.map((l, i) => {
          const hit = l.kind === 'food' ? shoppingMatch(matchKey(l.name), open, taken) : undefined
          if (hit) taken.add(hit.id)
          return {
            receiptId: receipt.id,
            position: i,
            rawText: l.rawText || null,
            name: l.name,
            quantity: l.quantity,
            unit: l.unit,
            priceVnd: l.priceVnd,
            kind: l.kind,
            toPantry: l.kind === 'food',
            shoppingItemId: hit?.id ?? null,
            forBakery: Boolean(opts.forBakery) && l.kind === 'food',
          }
        }),
      )
    }
    return receipt.id
  })
}

export async function getReceipt(db: Db, userId: string, receiptId: string) {
  const [receipt] = await db.select().from(receipts).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)))
  if (!receipt) return null
  const [lines, open] = await Promise.all([
    db.select().from(receiptLines).where(eq(receiptLines.receiptId, receipt.id)).orderBy(receiptLines.position),
    db
      .select({ id: shoppingItems.id, name: shoppingItems.name, boughtAt: shoppingItems.boughtAt })
      .from(shoppingItems)
      .where(and(eq(shoppingItems.userId, userId), isNull(shoppingItems.boughtAt))),
  ])
  // Lines may point at a shopping item that has been ticked meanwhile; keep it pickable.
  const linkedIds = lines.map((l) => l.shoppingItemId).filter((id): id is string => Boolean(id))
  const extra = linkedIds.length
    ? await db
        .select({ id: shoppingItems.id, name: shoppingItems.name, boughtAt: shoppingItems.boughtAt })
        .from(shoppingItems)
        .where(and(eq(shoppingItems.userId, userId), inArray(shoppingItems.id, linkedIds)))
    : []
  const shopping = [...open, ...extra.filter((e) => !open.some((o) => o.id === e.id))]
  return { receipt, lines, shopping }
}

export async function listReceipts(db: Db, userId: string, limit = 10) {
  return db.select().from(receipts).where(eq(receipts.userId, userId)).orderBy(desc(receipts.createdAt)).limit(limit)
}

export async function deleteReceipt(db: Db, userId: string, receiptId: string) {
  await db.delete(receipts).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId), isNull(receipts.appliedAt)))
}

/* -------------------------------------------------------------------------- */
/* Applying                                                                    */
/* -------------------------------------------------------------------------- */

export const applyInput = z.object({
  storeName: z.string().trim().max(120).nullable(),
  storeKind: z.enum(STORE_KINDS).nullable(),
  boughtOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(120),
        /** Free text like the rest of the app: "500 g", "2 hộp", "1 kg". */
        amount: z.string().trim().max(40),
        priceVnd: z.number().int().min(0).nullable(),
        toPantry: z.boolean(),
        shoppingItemId: z.uuid().nullable(),
        forBakery: z.boolean(),
      }),
    )
    .max(MAX_LINES),
})
export type ApplyInput = z.input<typeof applyInput>

const MASS: Record<string, number> = { g: 1, kg: 1000, mg: 0.001, lạng: 100 }
const VOLUME: Record<string, number> = { ml: 1, l: 1000 }

/** `add` expressed in `into`'s unit, when both are the same kind of measure. */
function convert(quantity: number, from: string | null, into: string | null): number | null {
  if ((from ?? '') === (into ?? '')) return quantity
  if (from && into && MASS[from] && MASS[into]) return (quantity * MASS[from]) / MASS[into]
  if (from && into && VOLUME[from] && VOLUME[into]) return (quantity * VOLUME[from]) / VOLUME[into]
  return null
}

export type ApplyResult = { added: string[]; increased: string[]; ticked: string[]; forBakery: number }

/**
 * Put the receipt into the kitchen. Bought food is ADDED to what the pantry
 * already holds when the units agree (6 eggs + 10 eggs = 16; 500 g + 1 kg =
 * 1500 g); otherwise the new amount replaces the old one, because a fresh
 * purchase is the better-known quantity. Expiry dates already set are kept.
 */
export async function applyReceipt(db: Db, userId: string, receiptId: string, raw: ApplyInput): Promise<ApplyResult> {
  const input = applyInput.parse(raw)

  return db.transaction(async (tx) => {
    // The claim: a double tap or a retried request applies nothing twice.
    const [claimed] = await tx
      .update(receipts)
      .set({ appliedAt: new Date(), storeName: input.storeName, storeKind: input.storeKind, boughtOn: input.boughtOn })
      .where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId), isNull(receipts.appliedAt)))
      .returning({ id: receipts.id })
    if (!claimed) throw new ReceiptError('Hóa đơn này đã được áp dụng rồi.')

    const own = await tx.select({ id: receiptLines.id }).from(receiptLines).where(eq(receiptLines.receiptId, receiptId))
    const ownIds = new Set(own.map((l) => l.id))

    for (const line of input.lines) {
      if (!ownIds.has(line.id)) continue
      const amount = parseAmount(line.amount)
      await tx
        .update(receiptLines)
        .set({
          name: line.name,
          quantity: amount.kind === 'measured' ? amount.quantity : null,
          unit: amount.kind === 'measured' ? amount.unit : null,
          priceVnd: line.priceVnd,
          toPantry: line.toPantry,
          shoppingItemId: line.shoppingItemId,
          forBakery: line.forBakery,
        })
        .where(eq(receiptLines.id, line.id))
    }

    // Pantry: merge per match key.
    const toPantry = input.lines.filter((l) => l.toPantry && ownIds.has(l.id))
    const keys = [...new Set(toPantry.map((l) => matchKey(l.name)))]
    const existing = keys.length
      ? await tx.select().from(pantryItems).where(and(eq(pantryItems.userId, userId), inArray(pantryItems.matchKey, keys)))
      : []

    const merged = new Map<string, { name: string; quantity: number | null; unit: string | null; expiresOn: string | null; note: string | null; foodId: string | null; grew: boolean }>()
    for (const line of toPantry) {
      const key = matchKey(line.name)
      const amount = parseAmount(line.amount)
      const bought = amount.kind === 'measured' ? { quantity: amount.quantity, unit: amount.unit } : { quantity: null, unit: null }
      const current = merged.get(key) ?? (() => {
        const row = existing.find((e) => e.matchKey === key)
        return row
          ? { name: row.name, quantity: row.quantity, unit: row.unit, expiresOn: row.expiresOn, note: row.note, foodId: row.foodId, grew: true }
          : { name: line.name, quantity: null, unit: null, expiresOn: null, note: null, foodId: null, grew: false }
      })()

      if (bought.quantity == null) {
        merged.set(key, current)
      } else if (current.quantity == null) {
        merged.set(key, { ...current, quantity: bought.quantity, unit: bought.unit })
      } else {
        const add = convert(bought.quantity, bought.unit, current.unit)
        merged.set(key, add != null ? { ...current, quantity: current.quantity + add } : { ...current, quantity: bought.quantity, unit: bought.unit })
      }
    }

    const txDb = tx as unknown as Db
    if (merged.size) {
      await savePantryItems(
        txDb,
        userId,
        [...merged.values()].map((m) => ({ name: m.name, quantity: m.quantity, unit: m.unit, expiresOn: m.expiresOn, note: m.note, foodId: m.foodId })),
      )
    }

    // Shopping list: tick the chosen lines.
    const tickIds = [...new Set(input.lines.filter((l) => ownIds.has(l.id) && l.shoppingItemId).map((l) => l.shoppingItemId!))]
    const ticked = tickIds.length
      ? await tx
          .update(shoppingItems)
          .set({ boughtAt: new Date() })
          .where(and(eq(shoppingItems.userId, userId), inArray(shoppingItems.id, tickIds), isNull(shoppingItems.boughtAt)))
          .returning({ name: shoppingItems.name })
      : []

    const values = [...merged.values()]
    return {
      added: values.filter((m) => !m.grew).map((m) => m.name),
      increased: values.filter((m) => m.grew).map((m) => (m.quantity != null ? `${m.name} (${formatQuantity(m.quantity)}${m.unit ? ` ${m.unit}` : ''})` : m.name)),
      ticked: ticked.map((t) => t.name),
      forBakery: input.lines.filter((l) => l.forBakery && ownIds.has(l.id)).length,
    }
  })
}

/**
 * "0.512 kg" for a stored line, for the review form. Exact on purpose: the
 * kitchen's formatQuantity rounds to friendly fractions (0.512 → ½), which is
 * right for a recipe and wrong for what the scale printed.
 */
export function amountText(quantity: number | null, unit: string | null): string {
  if (quantity == null) return ''
  const n = Math.round(quantity * 1000) / 1000
  return `${n}${unit ? ` ${unit}` : ''}`
}
