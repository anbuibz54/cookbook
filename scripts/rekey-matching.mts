/**
 * Recompute `match_key` on pantry and shopping rows after `matchKey` changes.
 *
 *   pnpm rekey:match
 *
 * The key is stored (it backs the one-row-per-thing unique index), so any
 * change to src/lib/match.ts leaves old rows keyed the old way and quietly
 * unmatched. Run this after every such change. Safe to run twice.
 *
 * If two pantry rows of one user now share a key, the newer one is kept and
 * the other reported and removed — they describe the same thing.
 */

import { eq } from 'drizzle-orm'
import { db } from '../src/server/db/index.ts'
import { pantryItems, shoppingItems } from '../src/server/db/schema.ts'
import { matchKey } from '../src/lib/match.ts'

let pantryChanged = 0
let pantryMerged = 0
const pantry = await db.select().from(pantryItems)
const seen = new Map<string, (typeof pantry)[number]>()

for (const row of [...pantry].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())) {
  const key = matchKey(row.name)
  const slot = `${row.userId}|${key}`
  const keeper = seen.get(slot)
  if (keeper) {
    console.log(`  duplicate "${row.name}" merged into "${keeper.name}"`)
    await db.delete(pantryItems).where(eq(pantryItems.id, row.id))
    pantryMerged++
    continue
  }
  seen.set(slot, row)
  if (row.matchKey !== key) {
    await db.update(pantryItems).set({ matchKey: key }).where(eq(pantryItems.id, row.id))
    pantryChanged++
  }
}

let shoppingChanged = 0
for (const row of await db.select().from(shoppingItems)) {
  const key = matchKey(row.name)
  if (row.matchKey !== key) {
    await db.update(shoppingItems).set({ matchKey: key }).where(eq(shoppingItems.id, row.id))
    shoppingChanged++
  }
}

console.log(`pantry: ${pantryChanged} rekeyed, ${pantryMerged} merged · shopping: ${shoppingChanged} rekeyed`)
process.exit(0)
