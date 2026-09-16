'use client'

import { useEffect } from 'react'
import { savePushSubscriptionAction } from '@/app/_actions/push'
import { currentSubscription } from '@/lib/push-client'

const SYNC_KEY = 'push-synced-on'

/**
 * Re-send this device's push subscription at most once a day. Push services
 * rotate endpoints, and a subscription the server lost (deleted after a 410)
 * would otherwise stay dead until someone toggled it in Settings.
 */
async function syncPush() {
  // Signed out: the save would bounce to /login. Next open after signing in syncs.
  if (location.pathname === '/login') return
  const today = new Date().toISOString().slice(0, 10)
  try {
    if (localStorage.getItem(SYNC_KEY) === today) return
  } catch {
    // Storage unavailable: sync anyway, it is idempotent.
  }
  const subscription = await currentSubscription()
  if (!subscription) return
  const { ok } = await savePushSubscriptionAction(subscription)
  if (!ok) return
  try {
    localStorage.setItem(SYNC_KEY, today)
  } catch {}
}

/**
 * Registers the offline worker, after load so it never competes with the first
 * render. Silently does nothing where service workers are unavailable (a
 * private window, an old browser) — offline reading and reminders are bonuses,
 * not requirements.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => syncPush())
        .catch(() => {})
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
