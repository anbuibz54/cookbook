/**
 * AI help on the meal log, for what arithmetic cannot do: dishes without a
 * recipe ("cơm trắng", "rau muống xào tỏi") and meals known only from a photo.
 *
 * Division of labour, same as the rest of the kitchen: recipes in the sổ are
 * matched against the pantry by the app (exact, free); the model only fills
 * the gaps, and only PROPOSES — every row lands unticked-or-ticked in front of
 * the cook, who confirms. Two guards against the model inventing things:
 *
 *  - It refers to pantry items by a code from the list it was given (P1, P2…).
 *    A code that is not on the list is dropped; it cannot "use" something the
 *    fridge does not hold.
 *  - Items the app already proposed from recipes are passed as taken, and
 *    anything it returns for them anyway is dropped.
 *
 * No `next/*` imports.
 */

import { generateText, Output } from 'ai'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db'
import { pantryItems, recipes } from '../db/schema'
import { formatAmount } from '@/lib/amount'
import { vnDate } from '@/lib/dates'
import { matchKey } from '@/lib/match'
import { activeModel, providerOptions } from './providers'

const MAX_ITEMS = 15

// Every field required (nullable instead of optional): Azure's strict
// structured-output mode rejects optional properties.
const schema = z.object({
  dishes: z
    .array(z.string())
    .describe('Tên các món thấy trong ảnh, tiếng Việt. CHỈ điền khi người dùng chưa cho biết món nào; ngược lại để [].'),
  used: z
    .array(
      z.object({
        pantry: z.string().describe('Mã trong danh sách tủ lạnh, ví dụ "P3". Không bao giờ bịa mã.'),
        amount: z.string().describe('Lượng đã dùng: "400 g", "2 quả", "1 bó", hoặc "hết".'),
        dish: z.string().describe('Dùng cho món nào.'),
      }),
    )
    .describe('Đồ trong tủ lạnh có lẽ đã dùng cho các món.'),
  bought: z
    .array(
      z.object({
        name: z.string().describe('Tên nguyên liệu tiếng Việt, như khi đi chợ.'),
        amount: z.string().describe('Lượng mua thường gặp: "500 g", "1 bó", "2 quả".'),
        dish: z.string(),
      }),
    )
    .describe('Nguyên liệu chính các món cần mà tủ lạnh không có.'),
  comment: z.string().nullable().describe('Một câu ngắn nếu có gì cần nói (ảnh không phải đồ ăn, không chắc...). Không thì null.'),
})

const INSTRUCTIONS = `Bạn giúp một người nấu ăn tại gia ở Việt Nam ghi lại bữa vừa nấu: họ đã dùng gì trong tủ lạnh và phải mua thêm gì.

Cách làm:
1. Nếu có ảnh, nhận ra món TỪ ẢNH trước, như thể không biết tủ lạnh có gì. Tủ lạnh có thịt gà không có nghĩa là món có gà.
2. Sau đó mới xem món đó cần gì, cái nào tủ có, cái nào phải mua.

Quy tắc:
- Tên món: một tên món Việt quen thuộc, chắc chắn nhất ("canh chua cá"), không liệt kê phương án trong ngoặc. Không chắc thì nói trong "comment".
- Chỉ đưa vào "used" những thứ CÓ trong danh sách tủ lạnh VÀ món thật sự cần (nhìn thấy trong ảnh hoặc là nguyên liệu chính của món), gọi bằng mã (P1, P2...). Không cố dùng đồ trong tủ cho có.
- Không đưa lại những mã nằm trong danh sách "đã tính".
- Ước lượng theo bữa cơm nhà bình thường cho 2–3 người, trừ khi ảnh cho thấy khác. Không dùng nhiều hơn lượng trong tủ; dùng hết thì ghi "hết".
- "bought": nguyên liệu chính mà món cần nhưng tủ không có. Bỏ qua gia vị cơ bản ai cũng có sẵn (muối, đường, nước mắm, dầu ăn, tiêu, bột ngọt, hạt nêm) trừ khi nó là thành phần chính.
- Không chắc thì bỏ qua — người dùng sẽ tự thêm. Một dòng sai tệ hơn thiếu một dòng.
- Tối đa ${MAX_ITEMS} dòng mỗi danh sách. Viết tiếng Việt.`

export type AiUse = { pantryItemId: string; name: string; have: string; amount: string; forDish: string }
export type AiBuy = { name: string; amount: string; forDish: string }
export type AiMealResult = { dishes: string[]; used: AiUse[]; bought: AiBuy[]; comment: string | null; provider: string }

export class NoProviderError extends Error {
  constructor() {
    super('Chưa cài AI. Vào Cài đặt để thêm Claude hoặc Azure OpenAI.')
  }
}

export async function suggestMealWithAi(
  db: Db,
  userId: string,
  input: {
    dishes: { name: string; recipeId: string | null }[]
    /** Pantry item ids already proposed from recipes. */
    accounted: string[]
    photo: { data: Uint8Array; mediaType: string } | null
  },
): Promise<AiMealResult> {
  const ai = await activeModel(db, userId)
  if (!ai) throw new NoProviderError()

  const today = vnDate()
  const recipeIds = input.dishes.map((d) => d.recipeId).filter((id): id is string => Boolean(id))
  const [pantryAll, owned] = await Promise.all([
    db.select().from(pantryItems).where(eq(pantryItems.userId, userId)),
    recipeIds.length
      ? db.select({ id: recipes.id }).from(recipes).where(and(eq(recipes.userId, userId), inArray(recipes.id, recipeIds)))
      : [],
  ])
  const pantry = pantryAll.filter((p) => p.expiresOn == null || p.expiresOn >= today)
  const withRecipe = new Set(owned.map((r) => r.id))
  const codes = new Map(pantry.map((p, i) => [`P${i + 1}`, p]))
  const accounted = new Set(input.accounted)

  const pantryText = pantry.length
    ? pantry
        .map((p, i) => {
          const have = p.quantity != null ? ` — còn ${formatAmount(p.quantity, p.unit)}` : ''
          return `P${i + 1}: ${p.name}${have}${accounted.has(p.id) ? ' (đã tính)' : ''}`
        })
        .join('\n')
    : '(tủ lạnh trống)'

  const dishText = input.dishes.length
    ? input.dishes
        .map((d) => `- ${d.name}${d.recipeId && withRecipe.has(d.recipeId) ? ' (có công thức, app đã tự tính nguyên liệu — chỉ bổ sung nếu thiếu rõ ràng)' : ''}`)
        .join('\n')
    : '(chưa nói — hãy đoán từ ảnh)'

  const { output } = await generateText({
    model: ai.model,
    instructions: INSTRUCTIONS,
    output: Output.object({ schema }),
    providerOptions: providerOptions(ai.kind),
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(60_000),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `Các món:\n${dishText}\n\nTủ lạnh:\n${pantryText}` },
          ...(input.photo
            ? [{ type: 'file' as const, mediaType: input.photo.mediaType, data: input.photo.data }]
            : []),
        ],
      },
    ],
  })

  const seen = new Set<string>()
  const used: AiUse[] = []
  for (const row of output.used) {
    const item = codes.get(row.pantry.trim().toUpperCase())
    if (!item || accounted.has(item.id) || seen.has(item.id)) continue
    seen.add(item.id)
    used.push({
      pantryItemId: item.id,
      name: item.name,
      have: item.quantity != null ? formatAmount(item.quantity, item.unit) : '',
      amount: row.amount.trim(),
      forDish: row.dish.trim(),
    })
  }

  const pantryKeys = new Set(pantry.map((p) => p.matchKey))
  const boughtKeys = new Set<string>()
  const bought: AiBuy[] = []
  for (const row of output.bought) {
    const key = matchKey(row.name)
    // "Bought" something the fridge already has is the model not reading the list.
    if (!key || pantryKeys.has(key) || boughtKeys.has(key)) continue
    boughtKeys.add(key)
    bought.push({ name: row.name.trim(), amount: row.amount.trim(), forDish: row.dish.trim() })
  }

  return {
    dishes: input.dishes.length ? [] : output.dishes.map((d) => d.trim()).filter(Boolean).slice(0, 5),
    used: used.slice(0, MAX_ITEMS),
    bought: bought.slice(0, MAX_ITEMS),
    comment: output.comment,
    provider: `${ai.label} · ${ai.modelId}`,
  }
}
