/*
 * Service worker: keep the app usable when the kitchen wifi drops.
 *
 * Network first, cache as fallback — a recipe you edited five minutes ago must
 * never be served stale while online, but a recipe you opened yesterday should
 * still be readable with no signal.
 *
 * Only same-origin GET navigations and static assets are cached. Never
 * /api/ (the MCP endpoint is not a page and must not be replayed) and never
 * anything with a query string, so search results do not pile up.
 */

const CACHE = 'cookbook-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function cacheable(request) {
  const url = new URL(request.url)
  if (request.method !== 'GET') return false
  if (url.origin !== self.location.origin) return false
  if (url.pathname.startsWith('/api/')) return false
  if (url.search) return false
  return true
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (!cacheable(request)) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only full, successful responses are worth keeping; a redirect to
        // /login cached as the home page would lock the app out offline.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        if (request.mode === 'navigate') {
          const home = await caches.match('/')
          if (home) return home
        }
        return new Response('Đang offline và chưa có bản lưu của trang này.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }),
  )
})

/*
 * Reminders. The server sends Declarative Web Push JSON
 * ({ web_push: 8030, notification: { title, body, navigate, tag } }), which
 * Safari 18.4+ shows by itself. Everywhere else this handler shows the same
 * notification. Every push MUST show one: iOS revokes the subscription of an
 * app that receives pushes silently.
 */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { notification: { title: 'Sổ công thức', body: event.data ? event.data.text() : '' } }
  }
  const n = data.notification || {}
  event.waitUntil(
    self.registration.showNotification(n.title || 'Sổ công thức', {
      body: n.body || '',
      tag: n.tag,
      lang: 'vi',
      icon: '/apple-icon',
      badge: '/icon',
      data: { navigate: n.navigate || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.navigate) || '/', self.location.origin)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === target.origin)
      if (open) return open.navigate(target.href).then((w) => (w || open).focus())
      return self.clients.openWindow(target.href)
    }),
  )
})
