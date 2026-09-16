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
