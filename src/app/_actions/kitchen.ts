'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import { removePantryItems, suggestFromPantry } from '@/server/pantry/service'
import {
  addShoppingItems,
  clearBought,
  removeShoppingItem,
  setBought,
} from '@/server/shopping/service'

const id = z.uuid()

export async function removePantryItemAction(itemId: string) {
  const { user } = await requireUser()
  const parsed = id.safeParse(itemId)
  if (!parsed.success) return

  await removePantryItems(db, user.id, { ids: [parsed.data] })
  revalidatePath('/pantry')
}

/** "Thiếu 3 món" → three lines on the shopping list, with the recipe attached. */
export async function addMissingToShoppingAction(recipeId: string) {
  const { user } = await requireUser()
  const parsed = id.safeParse(recipeId)
  if (!parsed.success) return

  const suggestion = (await suggestFromPantry(db, user.id, { limit: 200 })).find(
    (s) => s.recipeId === parsed.data,
  )
  if (!suggestion || suggestion.missing.length === 0) return

  await addShoppingItems(
    db,
    user.id,
    suggestion.missing.map((m) => ({
      name: m.name,
      quantity: m.quantity ?? null,
      unit: m.unit ?? null,
      note: m.short ? 'mua thêm cho đủ' : null,
      foodId: m.foodId ?? null,
      recipeId: suggestion.recipeId,
    })),
  )

  revalidatePath('/pantry')
  revalidatePath('/shopping')
}

export async function setBoughtAction(itemId: string, bought: boolean) {
  const { user } = await requireUser()
  const parsed = id.safeParse(itemId)
  if (!parsed.success) return

  await setBought(db, user.id, parsed.data, bought)
  revalidatePath('/shopping')
}

export async function removeShoppingItemAction(itemId: string) {
  const { user } = await requireUser()
  const parsed = id.safeParse(itemId)
  if (!parsed.success) return

  await removeShoppingItem(db, user.id, parsed.data)
  revalidatePath('/shopping')
}

export async function clearBoughtAction() {
  const { user } = await requireUser()
  await clearBought(db, user.id)
  revalidatePath('/shopping')
}

