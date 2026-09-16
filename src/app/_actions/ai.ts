'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/dal'
import { MissingSecretError } from '@/server/ai/crypto'
import { NoProviderError, suggestMealWithAi, type AiMealResult } from '@/server/ai/meal'
import {
  deleteProvider,
  describeAiError,
  providerInput,
  saveProvider,
  setActiveProvider,
  testProvider,
} from '@/server/ai/providers'
import { db } from '@/server/db'
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from '@/server/storage/photos'

const id = z.uuid()

/* Settings ----------------------------------------------------------------- */

export type ProviderFormState = { error?: string; saved?: boolean }

function field(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * Save, then test straight away: a key that does not work should say so on
 * the screen where it was typed, not on the meal log a week later.
 */
export async function saveProviderAction(
  providerId: string | null,
  _prev: ProviderFormState,
  form: FormData,
): Promise<ProviderFormState> {
  const { user } = await requireUser()
  const parsed = providerInput.safeParse({
    kind: field(form, 'kind'),
    label: field(form, 'label'),
    endpoint: field(form, 'endpoint'),
    model: field(form, 'model'),
    apiKey: field(form, 'apiKey'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Thiếu thông tin.' }
  if (providerId && !id.safeParse(providerId).success) return { error: 'Không tìm thấy cấu hình này.' }

  try {
    const saved = await saveProvider(db, user.id, parsed.data, providerId ?? undefined)
    await testProvider(db, user.id, saved.id)
  } catch (error) {
    if (error instanceof MissingSecretError) return { error: error.message }
    return { error: error instanceof Error ? error.message : 'Không lưu được.' }
  }
  revalidatePath('/settings')
  return { saved: true }
}

export async function setActiveProviderAction(providerId: string) {
  const { user } = await requireUser()
  if (id.safeParse(providerId).success) await setActiveProvider(db, user.id, providerId)
  revalidatePath('/settings')
}

export async function deleteProviderAction(providerId: string) {
  const { user } = await requireUser()
  if (id.safeParse(providerId).success) await deleteProvider(db, user.id, providerId)
  revalidatePath('/settings')
}

export async function testProviderAction(providerId: string): Promise<{ ok: boolean; message: string }> {
  const { user } = await requireUser()
  if (!id.safeParse(providerId).success) return { ok: false, message: 'Không tìm thấy cấu hình này.' }
  const result = await testProvider(db, user.id, providerId)
  revalidatePath('/settings')
  return result
}

/* Meal log ----------------------------------------------------------------- */

const suggestPayload = z.object({
  dishes: z.array(z.object({ name: z.string().trim().min(1).max(80), recipeId: z.uuid().nullable() })).max(10),
  accounted: z.array(z.uuid()).max(100),
})

export type SuggestMealResult = ({ ok: true } & AiMealResult) | { ok: false; error: string; setup?: boolean }

/** `payload` JSON + an optional `photo` (the phone sends a small copy, ~1024 px). */
export async function suggestMealAiAction(form: FormData): Promise<SuggestMealResult> {
  const { user } = await requireUser()

  let payload: unknown
  try {
    payload = JSON.parse(String(form.get('payload') ?? ''))
  } catch {
    return { ok: false, error: 'Dữ liệu gửi lên bị lỗi.' }
  }
  const parsed = suggestPayload.safeParse(payload)
  if (!parsed.success) return { ok: false, error: 'Dữ liệu gửi lên bị lỗi.' }

  const photo = form.get('photo')
  let image: { data: Uint8Array; mediaType: string } | null = null
  if (photo instanceof Blob && photo.size > 0) {
    if (!PHOTO_TYPES.includes(photo.type as (typeof PHOTO_TYPES)[number]) || photo.size > PHOTO_MAX_BYTES) {
      return { ok: false, error: 'Ảnh không hợp lệ.' }
    }
    image = { data: new Uint8Array(await photo.arrayBuffer()), mediaType: photo.type }
  }
  if (!image && parsed.data.dishes.length === 0) {
    return { ok: false, error: 'Chụp ảnh hoặc gõ tên món trước đã.' }
  }

  try {
    const result = await suggestMealWithAi(db, user.id, { ...parsed.data, photo: image })
    return { ok: true, ...result }
  } catch (error) {
    if (error instanceof NoProviderError) return { ok: false, error: error.message, setup: true }
    return { ok: false, error: `AI chưa trả lời được: ${describeAiError(error)}` }
  }
}
