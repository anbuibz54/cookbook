'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import { parseAmount } from '@/lib/amount'
import { matchKey } from '@/lib/match'
import { canonicalUnit } from '@/lib/units'
import { exactFood, suggestIngredientNames, type NameSuggestion } from '@/server/foods/service'
import {
  listPantry,
  removePantryItems,
  savePantryItems,
  suggestFromPantry,
  updatePantryItem,
} from '@/server/pantry/service'
import {
  addShoppingItems,
  clearBought,
  listShopping,
  removeShoppingItem,
  setBought,
  storeFromChoice,
  updateShoppingItem,
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


/* -------------------------------------------------------------------------- */
/* Adding and editing by hand (no AI needed)                                   */
/* -------------------------------------------------------------------------- */

export type KitchenFormState = { error?: string; done?: number }

function text(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * The amount box, shared with the meal log: "500 g", "6 quả", "nửa bó".
 * Words without a number ("một ít") are kept as the note instead of lost.
 */
function amountFields(form: FormData) {
  const amount = parseAmount(text(form, 'amount'))
  return amount.kind === 'measured'
    ? { quantity: amount.quantity, unit: amount.unit, note: text(form, 'note') }
    : { quantity: null, unit: null, note: amount.kind === 'text' ? amount.text : text(form, 'note') }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export async function addPantryItemAction(_prev: KitchenFormState, form: FormData): Promise<KitchenFormState> {
  const { user } = await requireUser()
  const name = text(form, 'name')
  if (!name) return { error: 'Thiếu tên món.' }
  if (name.length > 80) return { error: 'Tên dài quá.' }
  const expires = text(form, 'expiresOn')
  if (expires && !isoDate.safeParse(expires).success) return { error: 'Hạn dùng không hợp lệ.' }
  const { quantity, unit, note } = amountFields(form)

  // Adding what is already there ("mua thêm 6 trứng") adds up when the units
  // agree; otherwise the new amount replaces the old one.
  const existing = (await listPantry(db, user.id)).find((p) => p.matchKey === matchKey(name))
  const sameUnit = existing?.quantity != null && quantity != null && existing.unit === canonicalUnit(unit)
  const picked = pickedFood(form)
  const food = existing?.foodId || picked ? null : await exactFood(db, user.id, name)

  await savePantryItems(db, user.id, [
    {
      name: existing?.name ?? name,
      quantity: sameUnit ? existing!.quantity! + quantity! : quantity,
      unit,
      expiresOn: expires ?? existing?.expiresOn ?? null,
      note: note ?? existing?.note ?? null,
      foodId: existing?.foodId ?? picked ?? food?.id ?? null,
    },
  ])
  revalidatePath('/pantry')
  return { done: Date.now() }
}

export async function updatePantryItemAction(
  itemId: string,
  _prev: KitchenFormState,
  form: FormData,
): Promise<KitchenFormState> {
  const { user } = await requireUser()
  if (!id.safeParse(itemId).success) return { error: 'Không tìm thấy món này.' }
  const expires = text(form, 'expiresOn')
  if (expires && !isoDate.safeParse(expires).success) return { error: 'Hạn dùng không hợp lệ.' }

  const ok = await updatePantryItem(db, user.id, itemId, { ...amountFields(form), expiresOn: expires })
  if (!ok) return { error: 'Không tìm thấy món này.' }
  revalidatePath('/pantry')
  return { done: Date.now() }
}

export async function addShoppingItemAction(_prev: KitchenFormState, form: FormData): Promise<KitchenFormState> {
  const { user } = await requireUser()
  const name = text(form, 'name')
  if (!name) return { error: 'Thiếu tên món.' }
  if (name.length > 80) return { error: 'Tên dài quá.' }
  const { quantity, unit, note } = amountFields(form)
  const picked = pickedFood(form)
  const food = picked ? null : await exactFood(db, user.id, name)

  await addShoppingItems(db, user.id, [{ name, quantity, unit, note, foodId: picked ?? food?.id ?? null }])

  const storeId = await storeFromChoice(db, user.id, text(form, 'store'))
  if (storeId) {
    const line = (await listShopping(db, user.id)).find((l) => l.boughtAt == null && l.matchKey === matchKey(name))
    if (line) {
      await updateShoppingItem(db, user.id, line.id, {
        quantity: line.quantity,
        unit: line.unit,
        note: line.note,
        storeId,
      })
    }
  }
  revalidatePath('/shopping')
  return { done: Date.now() }
}

export async function updateShoppingItemAction(
  itemId: string,
  _prev: KitchenFormState,
  form: FormData,
): Promise<KitchenFormState> {
  const { user } = await requireUser()
  if (!id.safeParse(itemId).success) return { error: 'Không tìm thấy món này.' }
  const storeId = await storeFromChoice(db, user.id, text(form, 'store'))
  const ok = await updateShoppingItem(db, user.id, itemId, { ...amountFields(form), storeId })
  if (!ok) return { error: 'Không lưu được.' }
  revalidatePath('/shopping')
  return { done: Date.now() }
}

/** Typing a pantry / shopping name: recipe ingredient names first, then foods. */
export async function ingredientSuggestionsAction(query: string): Promise<NameSuggestion[]> {
  const { user } = await requireUser()
  if (typeof query !== 'string' || query.trim().length < 1 || query.length > 60) return []
  return suggestIngredientNames(db, user.id, query)
}

/** A food id picked from the suggestions, if it is a valid id; the service still checks visibility. */
function pickedFood(form: FormData) {
  const value = text(form, 'foodId')
  return value && id.safeParse(value).success ? value : null
}
