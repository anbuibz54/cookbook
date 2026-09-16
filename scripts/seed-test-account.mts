/**
 * A throwaway account with enough data that every screen has something on it.
 *
 *   pnpm seed:test
 *
 * Reads TEST_ACCOUNT_EMAIL / TEST_ACCOUNT_PASSWORD from .env.local. Creates the
 * Supabase Auth user if it is missing (confirmed, so it can sign in at once),
 * resets its password to the one in the env, then WIPES and re-seeds that
 * account's cookbook data. Only ever touches rows owned by that user.
 *
 * The auth project is shared with LifeOS, so this account could technically
 * sign in there too. It is never used for that; keep it that way.
 *
 * The data is chosen to exercise the screens, not to be good recipes:
 * a recipe with full nutrition, one with a gap, pantry items that are about to
 * expire, a shopping list split across shops plus an unsorted line.
 */

import { createClient } from '@supabase/supabase-js'
import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from '../src/server/db/index.ts'
import { foods, mcpTokens, pantryItems, recipes, shoppingItems, stores } from '../src/server/db/schema.ts'
import { provisionUser } from '../src/server/auth/provision.ts'
import { searchFoods } from '../src/server/foods/service.ts'
import { createRecipe, type CreateRecipeInput } from '../src/server/recipes/service.ts'
import { savePantryItems } from '../src/server/pantry/service.ts'
import { addShoppingItems, assignStore, listShopping, saveStore } from '../src/server/shopping/service.ts'

const email = process.env.TEST_ACCOUNT_EMAIL
const password = process.env.TEST_ACCOUNT_PASSWORD
if (!email || !password) throw new Error('Set TEST_ACCOUNT_EMAIL and TEST_ACCOUNT_PASSWORD in .env.local.')
if (!email.endsWith('@example.com')) {
  // A guard, not a style choice: this script deletes everything the account owns.
  throw new Error('The test account must use an @example.com address.')
}

/* -------------------------------------------------------------------------- */
/* The auth user                                                               */
/* -------------------------------------------------------------------------- */

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})

let authId: string | undefined
for (let page = 1; !authId; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
  if (error) throw error
  authId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id
  if (data.users.length < 200) break
}

if (authId) {
  const { error } = await admin.auth.admin.updateUserById(authId, { password, email_confirm: true })
  if (error) throw error
  console.log(`auth user exists, password reset: ${email}`)
} else {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  authId = data.user.id
  console.log(`auth user created: ${email}`)
}

const user = await provisionUser(db, { id: authId, email })

/* -------------------------------------------------------------------------- */
/* Wipe this account's cookbook data                                           */
/* -------------------------------------------------------------------------- */

await db.delete(shoppingItems).where(eq(shoppingItems.userId, user.id))
await db.delete(stores).where(eq(stores.userId, user.id))
await db.delete(pantryItems).where(eq(pantryItems.userId, user.id))
await db.delete(recipes).where(eq(recipes.userId, user.id))
await db.delete(foods).where(and(eq(foods.userId, user.id), isNotNull(foods.userId)))
await db.delete(mcpTokens).where(eq(mcpTokens.userId, user.id))

/* -------------------------------------------------------------------------- */
/* Seed                                                                        */
/* -------------------------------------------------------------------------- */

/** First reference food for a query, or none — a seed must not invent links. */
async function food(query: string): Promise<string | undefined> {
  const [hit] = await searchFoods(db, user.id, { query, limit: 1 })
  return hit?.id
}

type Line = CreateRecipeInput['ingredients'][number]
async function line(
  name: string,
  quantity: number | null,
  unit: string | null,
  query: string | null,
  extra: Partial<Line> = {},
): Promise<Line> {
  return {
    name,
    quantity,
    quantityMax: null,
    unit,
    note: null,
    section: null,
    optional: false,
    foodId: query ? ((await food(query)) ?? null) : null,
    grams: null,
    ...extra,
  }
}

const recipesToSeed: CreateRecipeInput[] = [
  {
    title: 'Bông lan trứng muối',
    summary: 'Cốt mềm ẩm, mặn ngọt vừa, chà bông phủ kín mặt.',
    servings: 8,
    yieldLabel: 'phần',
    prepMinutes: 30,
    cookMinutes: 53,
    cuisine: 'Việt',
    tags: ['bánh', 'nướng'],
    notes: 'Dữ liệu mẫu của tài khoản test.',
    sourceUrl: null,
    sourceLabel: null,
    authoredBy: 'ai',
    ingredients: [
      await line('trứng gà', 5, 'quả', 'trung ga', { section: 'Cốt bánh', note: 'tách lòng' }),
      await line('bột mì số 8', 70, 'g', 'bot mi so 8', { section: 'Cốt bánh' }),
      await line('sữa tươi không đường', 60, 'ml', 'sua tuoi nguyen kem', { section: 'Cốt bánh' }),
      await line('dầu ăn', 50, 'ml', 'dau an', { section: 'Cốt bánh' }),
      await line('đường cát trắng', 70, 'g', 'duong cat trang', { section: 'Cốt bánh' }),
      await line('muối', null, null, null, { section: 'Cốt bánh' }),
      await line('sốt mayonnaise', 150, 'g', 'sot mayonnaise', { section: 'Nhân và mặt bánh' }),
      // Deliberately unlinked: shows the "chưa có số liệu" state.
      await line('chà bông gà', 80, 'g', null, { section: 'Nhân và mặt bánh' }),
    ],
    steps: [
      { section: null, body: 'Đánh lòng đỏ với sữa và dầu cho quyện, rây bột mì vào trộn đều.', timerSeconds: null },
      { section: null, body: 'Đánh lòng trắng với đường đến chóp mềm, chia 3 lần trộn vào hỗn hợp lòng đỏ.', timerSeconds: null },
      { section: null, body: 'Đổ khuôn 20 cm, nướng ở 150°C.', timerSeconds: 45 * 60 },
      { section: null, body: 'Để nguội, cắt ngang bánh, phết mayonnaise giữa và quanh bánh.', timerSeconds: null },
      { section: null, body: 'Rắc chà bông kín mặt, cắt thành 8 phần.', timerSeconds: null },
    ],
  },
  {
    title: 'Trứng chiên hành lá',
    summary: 'Món 10 phút khi tủ còn trứng và hành.',
    servings: 2,
    yieldLabel: 'phần',
    prepMinutes: 5,
    cookMinutes: 5,
    cuisine: 'Việt',
    tags: ['món mặn', 'nhanh'],
    notes: null,
    sourceUrl: null,
    sourceLabel: null,
    authoredBy: 'human',
    ingredients: [
      await line('trứng gà', 3, 'quả', 'trung ga'),
      await line('hành lá', 2, 'cây', 'hanh la', { grams: 20 }),
      await line('nước mắm', 1, 'tsp', 'nuoc mam'),
      await line('dầu ăn', 1, 'tbsp', 'dau an'),
    ],
    steps: [
      { section: null, body: 'Đánh tan trứng với nước mắm và hành lá thái nhỏ.', timerSeconds: null },
      { section: null, body: 'Làm nóng dầu, đổ trứng vào chiên lửa vừa đến khi vàng hai mặt.', timerSeconds: 3 * 60 },
    ],
  },
  {
    title: 'Gà kho gừng',
    summary: 'Gà săn, nước kho sệt, thơm gừng.',
    servings: 4,
    yieldLabel: 'phần',
    prepMinutes: 15,
    cookMinutes: 30,
    cuisine: 'Việt',
    tags: ['món mặn'],
    notes: null,
    sourceUrl: null,
    sourceLabel: null,
    authoredBy: 'human',
    ingredients: [
      await line('thịt gà', 500, 'g', 'thit ga'),
      await line('gừng', 1, 'củ', 'gung', { grams: 40, note: 'thái sợi' }),
      await line('nước mắm', 2, 'tbsp', 'nuoc mam'),
      await line('đường', 1, 'tbsp', 'duong cat trang'),
      await line('sả', 2, 'cây', 'sa', { grams: 30 }),
    ],
    steps: [
      { section: null, body: 'Ướp gà với nước mắm, đường và một nửa gừng.', timerSeconds: 15 * 60 },
      { section: null, body: 'Phi thơm gừng còn lại, cho gà vào xào săn.', timerSeconds: null },
      { section: null, body: 'Thêm chút nước, kho nhỏ lửa đến khi nước sệt.', timerSeconds: 25 * 60 },
    ],
  },
]

for (const recipe of recipesToSeed) {
  await createRecipe(db, user.id, recipe, 'web')
}
console.log(`recipes: ${recipesToSeed.length}`)

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

await savePantryItems(db, user.id, [
  { name: 'trứng gà', quantity: 6, unit: 'quả', expiresOn: inDays(6), foodId: (await food('trung ga')) ?? null },
  { name: 'hành lá', quantity: 1, unit: 'bó', expiresOn: inDays(1), foodId: (await food('hanh la')) ?? null },
  { name: 'thịt gà', quantity: 500, unit: 'g', expiresOn: inDays(2), foodId: (await food('thit ga')) ?? null },
  { name: 'nước mắm', quantity: null, unit: null, foodId: (await food('nuoc mam')) ?? null },
  { name: 'dầu ăn', quantity: null, unit: null, foodId: (await food('dau an')) ?? null },
  { name: 'sữa tươi không đường', quantity: 1, unit: 'l', expiresOn: inDays(-1) },
])
console.log('pantry: 6')

await addShoppingItems(db, user.id, [
  { name: 'gừng', quantity: 1, unit: 'củ' },
  { name: 'sả', quantity: 3, unit: 'cây' },
  { name: 'đường cát trắng', quantity: 1, unit: 'kg' },
  { name: 'sốt mayonnaise', quantity: 1, unit: 'hũ' },
  { name: 'chà bông gà', quantity: 100, unit: 'g', note: 'loại không quá ngọt' },
])

const lines = await listShopping(db, user.id)
const byName = (name: string) => lines.filter((l) => l.name === name).map((l) => l.id)
const bhx = await saveStore(db, user.id, {
  kind: 'bhx',
  name: 'Bách Hóa Xanh (mẫu)',
  address: '[địa chỉ mẫu — không phải chi nhánh thật]',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=B%C3%A1ch+H%C3%B3a+Xanh',
})
const cho = await saveStore(db, user.id, {
  kind: 'cho',
  name: 'Chợ (mẫu)',
  address: null,
  mapsUrl: null,
})
await assignStore(db, user.id, [...byName('đường cát trắng'), ...byName('sốt mayonnaise')], bhx.id)
await assignStore(db, user.id, [...byName('gừng'), ...byName('sả')], cho.id)
console.log('shopping: 5 (4 sorted, 1 unsorted)')

console.log(`\nSign in at /login as ${email} (password in .env.local).`)
process.exit(0)
