/**
 * Web push: storing a device's subscription and sending it a notification.
 *
 * iPhone rules that shape this (iOS 16.4+):
 *  - Only an app installed to the home screen can subscribe, and permission
 *    must be asked from a tap.
 *  - Every push must show a notification; silent pushes get the subscription
 *    revoked. So nothing here is sent "just to check".
 *  - Payloads use the Declarative Web Push format (iOS 18.4+), which Safari
 *    shows without waking the service worker; `public/sw.js` shows the same
 *    fields for browsers that do not understand it.
 *
 * VAPID: NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY. Rotating the pair
 * silently breaks every existing subscription.
 *
 * No `next/*` imports.
 */

import { and, eq, inArray } from 'drizzle-orm'
import webpush from 'web-push'
import { z } from 'zod'
import type { Db } from '../db'
import { pushSubscriptions } from '../db/schema'

export const subscriptionInput = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
})

export type SubscriptionInput = z.output<typeof subscriptionInput>

/** Where links in notifications point. Vercel sets the production URL at runtime. */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:3100'
}

let configured = false
function vapid() {
  if (configured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) throw new Error('VAPID keys are not set.')
  // The subject is a contact for the push service; the app's own URL, not a
  // person's email address.
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? appUrl().replace('http://', 'https://'), publicKey, privateKey)
  configured = true
}

/** Upsert by endpoint: the same phone re-subscribing moves to whoever is signed in now. */
export async function saveSubscription(db: Db, userId: string, input: SubscriptionInput, userAgent: string | null) {
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent, lastSeenAt: new Date() },
    })
}

export async function removeSubscription(db: Db, userId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
}

export async function countSubscriptions(db: Db, userId: string): Promise<number> {
  const rows = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
  return rows.length
}

export type Notice = {
  title: string
  body: string
  /** App path to open on tap, e.g. "/log". */
  path: string
  /** Same tag replaces an earlier notification instead of stacking. */
  tag: string
}

/**
 * Send to every device of a user. Returns how many accepted it. Subscriptions
 * the push service says are gone (404/410) are deleted on the spot.
 */
export async function sendToUser(db: Db, userId: string, notice: Notice): Promise<{ sent: number; removed: number }> {
  vapid()
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
  if (subs.length === 0) return { sent: 0, removed: 0 }

  const navigate = `${appUrl()}${notice.path}`
  const payload = JSON.stringify({
    web_push: 8030,
    notification: { title: notice.title, body: notice.body, navigate, tag: notice.tag, lang: 'vi' },
  })

  const gone: string[] = []
  const delivered: string[] = []
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          // A reminder that arrives four hours late is noise, not a reminder.
          { TTL: 4 * 3600, urgency: 'normal', contentEncoding: 'aes128gcm' },
        )
        delivered.push(sub.id)
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) gone.push(sub.id)
      }
    }),
  )

  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone))
  if (delivered.length) {
    await db.update(pushSubscriptions).set({ lastSentAt: new Date() }).where(inArray(pushSubscriptions.id, delivered))
  }
  return { sent: delivered.length, removed: gone.length }
}
