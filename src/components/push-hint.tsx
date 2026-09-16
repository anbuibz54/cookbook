'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { pushState, type PushState } from '@/lib/push-client'

/**
 * On Hôm nay, under streaks that have reminder times: a one-line nudge when
 * this device would not receive them. Renders nothing once notifications are on
 * (or where they can never work), so it never nags.
 */
export function PushHint() {
  const [state, setState] = useState<PushState | null>(null)

  useEffect(() => {
    let alive = true
    pushState()
      .then((s) => alive && setState(s))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (state !== 'off' && state !== 'needs-install' && state !== 'denied') return null
  return (
    <Link
      href="/settings"
      transitionTypes={['tab']}
      className="rounded-2xl border border-dashed border-ink px-3.5 py-2.5 text-[13px] text-pretty hover:bg-surface"
    >
      {state === 'needs-install'
        ? 'Muốn được nhắc giờ nấu? Thêm app vào màn hình chính rồi bật thông báo trong Cài đặt ›'
        : state === 'denied'
          ? 'Thông báo đang bị chặn nên streak không nhắc được. Xem cách mở ›'
          : 'Streak có giờ nhắc nhưng máy này chưa bật thông báo. Bật trong Cài đặt ›'}
    </Link>
  )
}
