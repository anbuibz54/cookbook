'use client'

import { useEffect } from 'react'

/**
 * Registers the offline worker, after load so it never competes with the first
 * render. Silently does nothing where service workers are unavailable (a
 * private window, an old browser) — offline reading is a bonus, not a
 * requirement.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
