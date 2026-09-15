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
assert(tools.tools.length === 6, 'six tools are exposed')

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

await client.close()

if (process.argv.includes('--keep')) {
  console.log(`\nAll checks passed. Kept: ${baseUrl}/recipes/${recipeId}`)
} else {
  const { db } = await import('../src/server/db/index.ts')
  const { foods, recipes } = await import('../src/server/db/schema.ts')
  const { like } = await import('drizzle-orm')
  // By prefix rather than by id, so leftovers from a run that crashed midway go too.
  await db.delete(recipes).where(like(recipes.title, '[smoke]%'))
  await db.delete(foods).where(like(foods.nameVi, '[smoke]%'))
  console.log('\nAll checks passed. Test data removed.')
}
process.exit(0)
