'use server'

import { headers } from 'next/headers'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import { removeSubscription, saveSubscription, sendToUser, subscriptionInput } from '@/server/push/service'

/** The browser's PushSubscription.toJSON(). Also called on every app open to keep it fresh. */
export async function savePushSubscriptionAction(subscription: unknown): Promise<{ ok: boolean }> {
  const { user } = await requireUser()
  const parsed = subscriptionInput.safeParse(subscription)
  if (!parsed.success) return { ok: false }
  const userAgent = (await headers()).get('user-agent')?.slice(0, 300) ?? null
  await saveSubscription(db, user.id, parsed.data, userAgent)
  return { ok: true }
}

export async function removePushSubscriptionAction(endpoint: string): Promise<void> {
  const { user } = await requireUser()
  if (typeof endpoint === 'string' && endpoint.length < 1000) await removeSubscription(db, user.id, endpoint)
}

export async function sendTestPushAction(): Promise<{ ok: boolean; message: string }> {
  const { user } = await requireUser()
  try {
    const result = await sendToUser(db, user.id, {
      title: 'Sổ công thức',
      body: 'Thông báo chạy rồi nè. Đến giờ nhắc của streak, app sẽ gọi như thế này.',
      path: '/',
      tag: 'test',
    })
    if (result.sent === 0) return { ok: false, message: 'Chưa có thiết bị nào nhận được. Bật lại thông báo trên máy này nhé.' }
    return { ok: true, message: `Đã gửi tới ${result.sent} thiết bị.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không gửi được.' }
  }
}
