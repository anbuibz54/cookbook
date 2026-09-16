/**
 * Browser side of web push. Browser only.
 *
 * iPhone: `PushManager` exists only in an app opened from the home screen
 * (iOS 16.4+). In a Safari tab it is simply missing — that is the "install
 * first" state, not an error.
 */

export type PushState =
  /** No push at all here (old browser, or iPhone Safari tab). */
  | 'unsupported'
  /** iPhone/iPad in a browser tab: push exists once installed. */
  | 'needs-install'
  | 'denied'
  /** Allowed or not asked yet, but this device has no subscription. */
  | 'off'
  | 'on'

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export async function pushState(): Promise<PushState> {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!supported) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return subscription ? 'on' : 'off'
}

function applicationServerKey(): Uint8Array<ArrayBuffer> {
  const base64 = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** Must run inside a tap handler: iOS only shows the permission prompt for a user gesture. */
export async function subscribe(): Promise<PushSubscriptionJSON | null> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey() }))
  return subscription.toJSON()
}

export async function unsubscribe(): Promise<string | null> {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return null
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  return endpoint
}

export async function currentSubscription(): Promise<PushSubscriptionJSON | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  if (Notification.permission !== 'granted') return null
  const registration = await navigator.serviceWorker.ready
  return (await registration.pushManager.getSubscription())?.toJSON() ?? null
}
