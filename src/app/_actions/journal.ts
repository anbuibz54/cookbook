'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import { createMeal, deleteMeal, mealInput, proposeMeal } from '@/server/journal/service'
import { removePhotos, uploadPhoto } from '@/server/storage/photos'

const ids = z.array(z.uuid()).max(10)

/** Recipe × pantry → the rows the log screen prefills. No AI, no writes. */
export async function proposeMealAction(recipeIds: string[]) {
  const { user } = await requireUser()
  const parsed = ids.safeParse(recipeIds)
  if (!parsed.success) return { used: [], bought: [] }
  return proposeMeal(db, user.id, parsed.data)
}

export type SaveMealState = { error?: string }

/**
 * The form sends `payload` (JSON, shaped like `mealInput`) and an optional
 * `photo`, already shrunk on the phone. The photo is stored first: an orphan
 * file if the save then fails is cheap, a saved meal pointing at a missing
 * file is not.
 */
export async function saveMealAction(formData: FormData): Promise<SaveMealState> {
  const { user } = await requireUser()

  let payload: unknown
  try {
    payload = JSON.parse(String(formData.get('payload') ?? ''))
  } catch {
    return { error: 'Dữ liệu gửi lên bị lỗi, thử lại nhé.' }
  }
  const parsed = mealInput.safeParse(payload)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Thiếu thông tin.' }

  const photo = formData.get('photo')
  let photoPath: string | null = null
  if (photo instanceof Blob && photo.size > 0) {
    try {
      photoPath = await uploadPhoto(user.id, 'journal', photo)
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Không tải được ảnh lên.' }
    }
  }

  let result
  try {
    result = await createMeal(db, user.id, parsed.data, photoPath)
  } catch {
    if (photoPath) await removePhotos(user.id, [photoPath]).catch(() => {})
    return { error: 'Không lưu được bữa này, thử lại nhé.' }
  }

  revalidatePath('/')
  revalidatePath('/pantry')
  revalidatePath('/shopping')

  const { reduced, removed, unchanged } = result.pantry
  const query = new URLSearchParams({
    saved: '1',
    ...(reduced.length ? { reduced: String(reduced.length) } : {}),
    ...(removed.length ? { removed: String(removed.length) } : {}),
    ...(unchanged.length ? { unchanged: unchanged.join(', ') } : {}),
  })
  redirect(`/journal/${result.entryId}?${query}`)
}

export async function deleteMealAction(entryId: string) {
  const { user } = await requireUser()
  const parsed = z.uuid().safeParse(entryId)
  if (!parsed.success) redirect('/')

  const deleted = await deleteMeal(db, user.id, parsed.data)
  if (deleted?.photoPath) await removePhotos(user.id, [deleted.photoPath]).catch(() => {})

  revalidatePath('/')
  redirect('/')
}
