/**
 * End-to-end smoke test of the MCP endpoint, the way a real client uses it.
 *
 *   COOKBOOK_TOKEN=cookbook_... pnpm mcp:smoke [baseUrl] [--keep]
 *
 * Creates a food and a recipe, reads it back scaled, updates it, and checks
 * the nutrition numbers. Everything it creates is named "[smoke] …" and is
 * deleted at the end (pass --keep to look at it in the app first).
 *
 * Cleanup goes straight to the database, because MCP deliberately has no
 * delete tools — so it needs DATABASE_URL, i.e. run it with --env-file.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const baseUrl = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:3100'
const token = process.env.COOKBOOK_TOKEN
if (!token) throw new Error('Set COOKBOOK_TOKEN.')

const client = new Client({ name: 'smoke', version: '0.0.0' })
await client.connect(
  new StreamableHTTPClientTransport(new URL('/api/mcp', baseUrl), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
)

async function call(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args })
  const body = (result.content as { type: string; text: string }[]).map((c) => c.text).join('\n')
  console.log(`\n── ${name} ──\n${body}`)
  if (result.isError) throw new Error(`${name} failed`)
  return body
}

function firstUuid(s: string): string {
  const m = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  if (!m) throw new Error(`No id in: ${s}`)
  return m[0]
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
  console.log(`✓ ${message}`)
}

const tools = await client.listTools()
console.log('tools:', tools.tools.map((t) => t.name).join(', '))
assert(tools.tools.length === 17, 'seventeen tools are exposed')

// A food with round numbers, so the expected nutrition is easy to check by hand.
const sugar = firstUuid(
  await call('create_food', {
    name_vi: '[smoke] đường thử',
    name_en: 'smoke test sugar',
    source: 'ai_estimate',
    kcal: 400, protein_g: 0, fat_g: 0, carbs_g: 100, sugar_g: 100,
    density_g_per_ml: 0.8,
  }),
)

const found = await call('search_foods', { query: 'duong thu' })
assert(found.includes(sugar), 'search without diacritics finds the food')

const created = await call('create_recipe', {
  title: '[smoke] Nước đường',
  servings: 2,
  yield_label: 'ly',
  tags: ['smoke'],
  source_url: 'https://example.com/video',
  source_label: 'Smoke test',
  authored_by: 'ai',
  ingredients: [
    { name: 'đường', quantity: 100, unit: 'g', food_id: sugar },
    { name: 'đường thêm', quantity: 2, unit: 'muỗng canh', food_id: sugar }, // 30 ml × 0.8 = 24 g
    { name: 'nước', quantity: 1, unit: 'chén' },
    { name: 'đá', optional: true },
  ],
  steps: [{ body: 'Khuấy đường với nước.', timer_seconds: 60 }],
})
const recipeId = firstUuid(created)

// 124 g sugar × 4 kcal/g = 496 kcal total, 248 per serving. "nước" is unlinked → missing.
assert(created.includes('248 kcal'), 'per-serving kcal = (100 g + 2 tbsp×0.8 g/ml) × 4 / 2 servings')
assert(created.includes('2/3 ingredients counted'), 'optional excluded, unlinked water counted as missing')
assert(created.includes('Ước lượng thô'), 'ai_estimate food marks the recipe rough')

const scaled = await call('get_recipe', { recipe_id: recipeId, servings: 3 })
assert(scaled.includes('đường: 150 g'), 'scaling 2 → 3 servings multiplies quantities by 1.5')
assert(scaled.includes('"unit": "tbsp"'), 'Vietnamese unit is stored canonically')

const updated = await call('update_recipe', {
  recipe_id: recipeId,
  change_note: 'bớt đường',
  ingredients: [
    { name: 'đường', quantity: 50, unit: 'g', food_id: sugar },
    { name: 'nước', quantity: 1, unit: 'chén' },
  ],
})
assert(updated.includes('100 kcal'), 'after update: 50 g × 4 / 2 = 100 kcal per serving')

const search = await call('search_recipes', { search: 'nuoc duong' })
assert(search.includes(recipeId), 'recipe search ignores diacritics')

const bad = await call('create_recipe', {
  title: '[smoke] invalid', authored_by: 'ai', ingredients: [], steps: [{ body: 'x' }],
})
assert(bad.startsWith('Rejected'), 'invalid input is rejected with a message, not a crash')

// ── Reference data (needs `pnpm foods:import` to have run) ──────────────────
// Count and volume units resolved from USDA portions and density, no guessing.

function idOnLineWith(body: string, label: string): string {
  const line = body.split('\n').find((l) => l.includes(label))
  if (!line) throw new Error(`No "${label}" in:\n${body}`)
  return firstUuid(line)
}

const eggs = await call('search_foods', { query: 'trung ga' })
assert(eggs.includes('trứng gà (Egg, whole, raw, fresh)'), 'Vietnamese search finds the USDA egg')
assert(eggs.includes('1 medium = 44 g'), 'USDA portions are listed')
const egg = idOnLineWith(eggs, 'trứng gà (Egg, whole, raw, fresh)')
const garlic = idOnLineWith(await call('search_foods', { query: 'tỏi' }), 'tỏi (Garlic, raw)')
const butter = idOnLineWith(await call('search_foods', { query: 'bo lat' }), 'bơ lạt (Butter, without salt)')

const usdaRecipe = await call('create_recipe', {
  title: '[smoke] Trứng chiên bơ tỏi',
  servings: 1,
  authored_by: 'ai',
  ingredients: [
    { name: 'trứng gà', quantity: 2, unit: 'quả', food_id: egg },
    { name: 'tỏi', quantity: 3, unit: 'tép', food_id: garlic },
    { name: 'bơ lạt', quantity: 2, unit: 'muỗng canh', food_id: butter },
  ],
  steps: [{ body: 'Phi tỏi với bơ, đập trứng vào chiên.' }],
})
const usdaId = firstUuid(usdaRecipe)
const usdaFull = await call('get_recipe', { recipe_id: usdaId })

// 2 medium eggs 88 g · 3 cloves 9 g · 30 ml butter × (227 g / 240 ml) = 28.4 g
assert(usdaFull.includes('"grams": 88'), '2 quả trứng → 2 × medium egg (44 g)')
assert(usdaFull.includes('"grams": 9'), '3 tép tỏi → 3 × clove (3 g)')
assert(usdaFull.includes('"grams": 28.4'), '2 muỗng canh bơ → 30 ml × density from the cup portion')
assert(usdaRecipe.includes('3/3 ingredients counted'), 'every line counted without supplied grams')
assert(usdaRecipe.includes('Ước lượng'), 'typical portion sizes are reported as approximate')

// ── Kitchen: pantry → suggestions → shopping list → shops ───────────────────

const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

await call('save_pantry_items', {
  items: [
    { name: '[smoke] bột thử', quantity: 500, unit: 'g' },
    { name: '[smoke] trứng thử', quantity: 2, unit: 'quả', expires_on: tomorrow },
  ],
})
const pantry = await call('list_pantry', {})
assert(pantry.includes('[smoke] bột thử') && pantry.includes(`HSD ${tomorrow}`), 'pantry keeps amounts and expiry')

const pantryRecipe = firstUuid(
  await call('create_recipe', {
    title: '[smoke] Bánh thử',
    servings: 1,
    authored_by: 'ai',
    ingredients: [
      { name: '[smoke] bột thử', quantity: 200, unit: 'g' },
      { name: '[smoke] trứng thử', quantity: 1, unit: 'quả', grams: 50 },
      { name: '[smoke] sữa thử', quantity: 100, unit: 'ml', grams: 100 },
      { name: 'muối', unit: 'vừa ăn' },
    ],
    steps: [{ body: 'Trộn rồi nướng.' }],
  }),
)

const suggested = await call('suggest_from_pantry', {})
const line = suggested.split('\n').find((l) => l.includes(pantryRecipe)) ?? ''
assert(line.includes('[2/3]'), 'two of three countable ingredients are in the pantry')
assert(line.includes('thiếu 1: [smoke] sữa thử'), 'only the genuinely missing ingredient is missing')
assert(!line.includes('muối'), '"vừa ăn" lines are not treated as shopping')
assert(line.includes('sắp hết hạn'), 'a recipe using something about to expire says so')

await call('add_to_shopping_list', {
  items: [{ name: '[smoke] sữa thử', quantity: 100, unit: 'ml', recipe_id: pantryRecipe }],
})
await call('add_to_shopping_list', {
  items: [{ name: '[smoke] sữa thử', quantity: 50, unit: 'ml' }],
})
const beforeSort = await call('get_shopping_list', {})
assert(
  beforeSort.split('\n').filter((l) => l.includes('[smoke] sữa thử')).length === 1,
  'the same item twice merges into one line',
)
assert(beforeSort.includes('150 ml'), 'merged amounts add up')
assert(beforeSort.includes('[chưa phân loại]'), 'a new line has no shop until something sorts it')

const shoppingId = firstUuid(beforeSort.split('\n').find((l) => l.includes('[smoke] sữa thử'))!)
await call('assign_shopping_stores', {
  assignments: [
    {
      item_ids: [shoppingId],
      kind: 'bhx',
      store_name: '[smoke] Bách Hóa Xanh thử',
      address: '123 Đường Thử, Quận Thử',
      maps_url: 'https://www.google.com/maps/search/?api=1&query=B%C3%A1ch+H%C3%B3a+Xanh',
    },
  ],
})
const afterSort = await call('get_shopping_list', {})
assert(afterSort.includes('[Bách Hóa Xanh · [smoke] Bách Hóa Xanh thử]'), 'the line moved to its shop')

await client.close()

if (process.argv.includes('--keep')) {
  console.log(`\nAll checks passed. Kept: ${baseUrl}/recipes/${recipeId}`)
} else {
  const { db } = await import('../src/server/db/index.ts')
  const { foods, pantryItems, recipes, shoppingItems, stores } = await import('../src/server/db/schema.ts')
  const { like } = await import('drizzle-orm')
  // By prefix rather than by id, so leftovers from a run that crashed midway go too.
  await db.delete(shoppingItems).where(like(shoppingItems.name, '[smoke]%'))
  await db.delete(stores).where(like(stores.name, '[smoke]%'))
  await db.delete(pantryItems).where(like(pantryItems.name, '[smoke]%'))
  await db.delete(recipes).where(like(recipes.title, '[smoke]%'))
  await db.delete(foods).where(like(foods.nameVi, '[smoke]%'))
  console.log('\nAll checks passed. Test data removed.')
}
process.exit(0)
