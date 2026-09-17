'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { flushQueue, onQueueChange, readQueue, type Op } from '@/lib/offline-queue'

const EMPTY: Op[] = []
let cached: { raw: string; ops: Op[] } = { raw: '[]', ops: EMPTY }

/** The queue as a React store; the snapshot is cached so identical reads stay the same object. */
function snapshot(): Op[] {
  const ops = readQueue()
  const raw = JSON.stringify(ops)
  if (raw !== cached.raw) cached = { raw, ops }
  return cached.ops
}

export function useOfflineQueue(): Op[] {
  return useSyncExternalStore(onQueueChange, snapshot, () => EMPTY)
}

function useOnline() {
  return useSyncExternalStore(
    (listener) => {
      window.addEventListener('online', listener)
      window.addEventListener('offline', listener)
      return () => {
        window.removeEventListener('online', listener)
        window.removeEventListener('offline', listener)
      }
    },
    () => navigator.onLine,
    () => true,
  )
}

/**
 * Mounted once in the root layout. Sends queued kitchen changes when the
 * connection comes back (and every 30 s while any are waiting, because
 * `online` fires unreliably on iOS), refreshes the page with the real data,
 * and shows a small bar while offline or while changes are waiting.
 */
export function OfflineSync() {
  const router = useRouter()
  const queue = useOfflineQueue()
  const online = useOnline()
  const [note, setNote] = useState<string | null>(null)

  const flush = useCallback(async () => {
    if (!navigator.onLine || readQueue().length === 0) return
    const { sent, rejected } = await flushQueue()
    if (sent || rejected.length) router.refresh()
    if (rejected.length) setNote(`Không gửi được: ${rejected.join('; ')}`)
    else if (sent) setNote(`Đã gửi ${sent} thay đổi lúc mất mạng.`)
  }, [router])

  useEffect(() => {
    // First attempt right after mount (a change queued before the app was closed).
    const first = setTimeout(flush, 1000)
    window.addEventListener('online', flush)
    const timer = setInterval(flush, 30_000)
    return () => {
      clearTimeout(first)
      window.removeEventListener('online', flush)
      clearInterval(timer)
    }
  }, [flush])

  useEffect(() => {
    if (!note) return
    const timer = setTimeout(() => setNote(null), 6000)
    return () => clearTimeout(timer)
  }, [note])

  const text = !online
    ? queue.length
      ? `Đang mất mạng · ${queue.length} thay đổi lưu tạm, có mạng sẽ tự gửi`
      : 'Đang mất mạng · thêm/sửa tủ lạnh và đi chợ vẫn được, có mạng sẽ tự gửi'
    : queue.length
      ? `Đang gửi ${queue.length} thay đổi lưu tạm…`
      : note

  if (!text) return null
  return (
    <div
      role="status"
      // Just above the tab bar: at the top it covered page titles.
      style={{ bottom: 'calc(max(12px, env(safe-area-inset-bottom)) + 68px)' }}
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4"
    >
      <span
        className={`pointer-events-auto rounded-full border-2 border-ink px-3.5 py-1.5 text-[13px] text-pretty shadow-pop-sm ${
          !online ? 'bg-warn-bg text-warn-ink' : 'bg-surface'
        }`}
      >
        {text}
      </span>
    </div>
  )
}

/** "Chờ gửi" list on a kitchen screen, so a change made offline is visibly not lost. */
export function PendingOps({ scope }: { scope: 'pantry' | 'shopping' }) {
  const queue = useOfflineQueue().filter((op) => op.kind.startsWith(`${scope}.`))
  if (queue.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5 rounded-[18px] border-2 border-dashed border-ink bg-warn-bg px-4 py-3 text-warn-ink">
      <span className="text-[13px] font-medium">Chờ gửi khi có mạng</span>
      <ul className="flex flex-col gap-0.5 text-sm">
        {queue.map((op) => (
          <li key={op.id}>· {op.label}</li>
        ))}
      </ul>
    </div>
  )
}
