'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import { NoProviderError } from '@/server/ai/meal'
import { log } from '@/server/logger'
import { applyReceipt, createReceipt, deleteReceipt, readReceiptPhoto, ReceiptError, type ApplyInput, type ApplyResult } from '@/server/receipts/service'
import { PHOTO_MAX_BYTES, PHOTO_TYPES, uploadPhoto } from '@/server/storage/photos'

export type ReadReceiptState = { receiptId: string } | { error: string; settings?: boolean } | null

/** Photo in, draft receipt out. The phone sends a ~2400 px JPEG — receipts need the detail. */
export async function readReceiptAction(_prev: ReadReceiptState, form: FormData): Promise<ReadReceiptState> {
  const { user } = await requireUser()
  const photo = form.get('photo')
  if (!(photo instanceof Blob) || photo.size === 0) return { error: 'Chụp hoặc chọn ảnh hóa đơn trước nhé.' }
  if (!PHOTO_TYPES.includes(photo.type as (typeof PHOTO_TYPES)[number]) || photo.size > PHOTO_MAX_BYTES) {
    return { error: 'Ảnh phải là JPEG, PNG hoặc WebP, dưới 4 MB.' }
  }

  try {
    const bytes = new Uint8Array(await photo.arrayBuffer())
    const [parsed, photoPath] = await Promise.all([
      readReceiptPhoto(db, user.id, { data: bytes, mediaType: photo.type }),
      uploadPhoto(user.id, 'receipts', photo),
    ])
    if (parsed.lines.length === 0) {
      return { error: parsed.comment ?? 'Không đọc được món nào trên ảnh. Chụp thẳng, đủ sáng, thấy cả hóa đơn nhé.' }
    }
    const receiptId = await createReceipt(db, user.id, parsed, { photoPath, source: 'photo', forBakery: form.get('forBakery') === 'on' })
    return { receiptId }
  } catch (error) {
    if (error instanceof NoProviderError) return { error: error.message, settings: true }
    log.error('receipt read failed', { error })
    return { error: 'AI chưa đọc được hóa đơn lúc này. Thử lại sau chút nhé.' }
  }
}

export type ApplyReceiptState = { ok: ApplyResult } | { error: string } | null

export async function applyReceiptAction(_prev: ApplyReceiptState, form: FormData): Promise<ApplyReceiptState> {
  const { user } = await requireUser()
  const receiptId = z.uuid().safeParse(form.get('receiptId'))
  if (!receiptId.success) return { error: 'Không tìm thấy hóa đơn.' }
  let payload: ApplyInput
  try {
    payload = JSON.parse(String(form.get('payload') ?? '{}'))
  } catch {
    return { error: 'Dữ liệu gửi lên bị hỏng, tải lại trang nhé.' }
  }

  try {
    const result = await applyReceipt(db, user.id, receiptId.data, payload)
    revalidatePath('/pantry')
    revalidatePath('/shopping')
    revalidatePath(`/receipts/${receiptId.data}`)
    return { ok: result }
  } catch (error) {
    if (error instanceof ReceiptError) return { error: error.message }
    if (error instanceof z.ZodError) return { error: 'Có dòng chưa hợp lệ — tên không được trống.' }
    log.error('receipt apply failed', { error })
    return { error: 'Chưa áp dụng được hóa đơn. Thử lại nhé.' }
  }
}

export async function deleteReceiptAction(receiptId: string) {
  const { user } = await requireUser()
  const parsed = z.uuid().safeParse(receiptId)
  if (!parsed.success) return
  await deleteReceipt(db, user.id, parsed.data)
  revalidatePath('/receipts/new')
}
