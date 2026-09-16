/**
 * The shopping list, and where each line is bought.
 *
 * Division of labour: the app decides WHAT is missing (set arithmetic against
 * the pantry — exact, instant, free) and Claude decides WHERE to buy it (which
 * needs web search and local knowledge: what Bách Hóa Xanh actually stocks,
 * which chợ is nearby). The app never calls a search engine; it stores what
 * Claude found and shows it.
 *
 * No `next/*` imports.
 */

import { and, asc, eq, inArray, isNull, isNotNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db'
import { recipes, shoppingItems, stores } from '../db/schema'
import { foodsByIds } from '../foods/service'
import { matchKey } from '@/lib/match'
import { canonicalUnit, gramsFor } from '@/lib/units'

export type ShoppingItem = typeof shoppingItems.$inferSelect
export type Store = typeof stores.$inferSelect

export const STORE_KINDS = ['bhx', 'cho', 'sieu_thi', 'online'] as const
export type StoreKind = (typeof STORE_KINDS)[number]

export const STORE_LABEL: Record<StoreKind, string> = {
  bhx: 'Bách Hóa Xanh',
  cho: 'Chợ',
  sieu_thi: 'Siêu thị',
  online: 'Đặt online',
}

export const shoppingItemInput = z.object({
  name: z.string().trim().min(1, 'Thiếu tên món cần mua.'),
  quantity: z.number().positive().nullish(),
  unit: z.string().trim().min(1).nullish(),
  note: z.string().trim().min(1).nullish(),
  foodId: z.uuid().nullish(),
  recipeId: z.uuid().nullish(),
})

export type ShoppingItemInput = z.output<typeof shoppingItemInput>

export type ShoppingLine = ShoppingItem & {
  store: Store | null
  recipeTitle: string | null
}

/** The whole list, open lines first, each with its shop and where it came from. */
export async function listShopping(db: Db, userId: string): Promise<ShoppingLine[]> {
  const rows = await db
    .select({ item: shoppingItems, store: stores, recipeTitle: recipes.title })
    .from(shoppingItems)
    .leftJoin(stores, eq(shoppingItems.storeId, stores.id))
    .leftJoin(recipes, eq(shoppingItems.recipeId, recipes.id))
    .where(eq(shoppingItems.userId, userId))
    .orderBy(sql`${shoppingItems.boughtAt} asc nulls first`, asc(shoppingItems.createdAt))

  return rows.map((r) => ({ ...r.item, store: r.store, recipeTitle: r.recipeTitle }))
}

/**
 * Add lines, merging with what is already on the list.
 *
 * Two recipes that both want hành lá should leave one line, not two — and when
 * both amounts are weighed, the merged line carries the sum. Different units
 * ("2 củ" and "150 g") keep the first amount and note the second, because
 * quietly picking one would send you home with the wrong quantity.
 */
export async function addShoppingItems(
  db: Db,
  userId: string,
  items: ShoppingItemInput[],
): Promise<{ added: number; merged: number }> {
  if (items.length === 0) return { added: 0, merged: 0 }

  const foodIds = [...new Set(items.map((i) => i.foodId).filter((id): id is string => Boolean(id)))]
  const linked = await foodsByIds(db, userId, foodIds)

  const open = await db
    .select()
    .from(shoppingItems)
    .where(and(eq(shoppingItems.userId, userId), isNull(shoppingItems.boughtAt)))

  let added = 0
  let merged = 0

  for (const item of items) {
    const key = matchKey(item.name)
    const food = item.foodId ? linked.get(item.foodId) : undefined
    const unit = canonicalUnit(item.unit)
    const grams = gramsFor(item.quantity, null, item.unit, food)?.grams ?? null
    const existing = open.find((row) => row.matchKey === key)

    if (!existing) {
      const [row] = await db
        .insert(shoppingItems)
        .values({
          userId,
          foodId: food?.id ?? null,
          recipeId: item.recipeId ?? null,
          name: item.name,
          matchKey: key,
          quantity: item.quantity ?? null,
          unit,
          grams,
          note: item.note ?? null,
        })
        .returning()
      open.push(row)
      added++
      continue
    }

    const sameUnit = existing.unit === unit
    const bothCounted = existing.quantity != null && item.quantity != null
    await db
      .update(shoppingItems)
      .set({
        quantity: sameUnit && bothCounted ? existing.quantity! + item.quantity! : existing.quantity,
        grams: existing.grams != null && grams != null ? existing.grams + grams : (existing.grams ?? grams),
        note:
          sameUnit || item.quantity == null
            ? existing.note
            : [existing.note, `thêm ${item.quantity} ${unit ?? ''}`.trim()].filter(Boolean).join(' · '),
        foodId: existing.foodId ?? food?.id ?? null,
      })
      .where(eq(shoppingItems.id, existing.id))
    merged++
  }

  return { added, merged }
}

export async function setBought(db: Db, userId: string, itemId: string, bought: boolean) {
  await db
    .update(shoppingItems)
    .set({ boughtAt: bought ? new Date() : null })
    .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.userId, userId)))
}

export async function removeShoppingItem(db: Db, userId: string, itemId: string) {
  await db
    .delete(shoppingItems)
    .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.userId, userId)))
}

/** Clear the bought lines once the trip is over. */
export async function clearBought(db: Db, userId: string): Promise<number> {
  const rows = await db
    .delete(shoppingItems)
    .where(and(eq(shoppingItems.userId, userId), isNotNull(shoppingItems.boughtAt)))
    .returning({ id: shoppingItems.id })
  return rows.length
}

/* -------------------------------------------------------------------------- */
/* Stores                                                                      */
/* -------------------------------------------------------------------------- */

export const storeInput = z.object({
  kind: z.enum(STORE_KINDS),
  name: z.string().trim().min(1),
  address: z.string().trim().min(1).nullish(),
  mapsUrl: z.url().nullish(),
})

export async function listStores(db: Db, userId: string): Promise<Store[]> {
  return db.select().from(stores).where(eq(stores.userId, userId)).orderBy(asc(stores.name))
}

/** A shop, created on first use and reused afterwards; details refresh on repeat. */
export async function saveStore(
  db: Db,
  userId: string,
  input: z.output<typeof storeInput>,
): Promise<Store> {
  const [row] = await db
    .insert(stores)
    .values({
      userId,
      kind: input.kind,
      name: input.name,
      address: input.address ?? null,
      mapsUrl: input.mapsUrl ?? null,
    })
    .onConflictDoUpdate({
      target: [stores.userId, stores.kind, stores.name],
      set: {
        address: sql`coalesce(excluded.address, ${stores.address})`,
        mapsUrl: sql`coalesce(excluded.maps_url, ${stores.mapsUrl})`,
      },
    })
    .returning()
  return row
}

/** Put a set of lines in a shop. Returns how many lines actually moved. */
export async function assignStore(
  db: Db,
  userId: string,
  itemIds: string[],
  storeId: string,
): Promise<number> {
  if (itemIds.length === 0) return 0
  const rows = await db
    .update(shoppingItems)
    .set({ storeId })
    .where(and(eq(shoppingItems.userId, userId), inArray(shoppingItems.id, itemIds)))
    .returning({ id: shoppingItems.id })
  return rows.length
}

/**
 * Change a line by hand: its amount, and where it is bought. `storeId` null
 * moves it back to "Chưa phân loại". The store must be the user's.
 */
export async function updateShoppingItem(
  db: Db,
  userId: string,
  itemId: string,
  edit: { quantity: number | null; unit: string | null; note: string | null; storeId: string | null },
): Promise<boolean> {
  if (edit.storeId) {
    const [own] = await db
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, edit.storeId), eq(stores.userId, userId)))
    if (!own) return false
  }
  const [item] = await db
    .select()
    .from(shoppingItems)
    .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.userId, userId)))
  if (!item) return false

  const linked = item.foodId ? await foodsByIds(db, userId, [item.foodId]) : new Map()
  const grams = gramsFor(edit.quantity, null, edit.unit, item.foodId ? linked.get(item.foodId) : undefined)
  await db
    .update(shoppingItems)
    .set({
      quantity: edit.quantity,
      unit: canonicalUnit(edit.unit),
      grams: grams?.grams ?? null,
      note: edit.note,
      storeId: edit.storeId,
    })
    .where(eq(shoppingItems.id, item.id))
  return true
}

/**
 * A store picked in the app: an existing one by id, or a plain kind ("Bách
 * Hóa Xanh" with no branch yet), created on first use. Claude can later
 * replace it with a real branch and address.
 */
export async function storeFromChoice(db: Db, userId: string, choice: string | null): Promise<string | null> {
  if (!choice) return null
  if (choice.startsWith('kind:')) {
    const kind = choice.slice(5)
    if (!STORE_KINDS.includes(kind as StoreKind)) return null
    const store = await saveStore(db, userId, { kind: kind as StoreKind, name: STORE_LABEL[kind as StoreKind] })
    return store.id
  }
  if (choice.startsWith('store:')) return choice.slice(6)
  return null
}
