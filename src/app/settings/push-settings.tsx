'use client'

import { useEffect, useState, useTransition } from 'react'
import { removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from '@/app/_actions/push'
import { pushState, subscribe, unsubscribe, type PushState } from '@/lib/push-client'

const EXPLAIN: Record<Exclude<PushState, 'on' | 'off'>, string> = {
  'needs-install':
    'Trên iPhone, thông báo chỉ chạy khi mở app từ màn hình chính: bấm Chia sẻ → Thêm vào MH chính, rồi mở app từ icon đó và quay lại đây.',
  denied: 'Thông báo đang bị chặn. Vào Cài đặt của iPhone → Thông báo → Sổ công thức để cho phép, rồi quay lại đây.',
  unsupported: 'Trình duyệt này không hỗ trợ thông báo.',
}

/** "Thông báo nhắc" on Settings: this device on/off, and a test send. */
export function PushSettings({ reminders }: { reminders: number }) {
  const [state, setState] = useState<PushState | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let alive = true
    pushState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState('unsupported'))
    return () => {
      alive = false
    }
  }, [])

  function turnOn() {
    setMessage(null)
    startTransition(async () => {
      try {
        const subscription = await subscribe()
        if (!subscription) {
          setState(await pushState())
          return
        }
        const saved = await savePushSubscriptionAction(subscription)
        setState(saved.ok ? 'on' : 'off')
        if (!saved.ok) setMessage({ ok: false, text: 'Không lưu được đăng ký, thử lại nhé.' })
      } catch {
        setMessage({ ok: false, text: 'Không bật được thông báo trên máy này.' })
      }
    })
  }

  function turnOff() {
    setMessage(null)
    startTransition(async () => {
      const endpoint = await unsubscribe()
      if (endpoint) await removePushSubscriptionAction(endpoint)
      setState('off')
    })
  }

  function test() {
    setMessage(null)
    startTransition(async () => {
      const result = await sendTestPushAction()
      setMessage({ ok: result.ok, text: result.message })
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold">Thông báo trên máy này</span>
          <span className="text-xs text-muted">
            {state === 'on'
              ? `Đang bật · ${reminders} streak có giờ nhắc`
              : reminders
                ? `${reminders} streak có giờ nhắc`
                : 'Chưa streak nào có giờ nhắc'}
          </span>
        </div>
        {state === 'off' ? (
          <button
            type="button"
            onClick={turnOn}
            disabled={pending}
            className="h-10 shrink-0 rounded-full border-2 border-ink bg-primary px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? 'Đang bật…' : 'Bật'}
          </button>
        ) : state === 'on' ? (
          <span className="shrink-0 rounded-full bg-tile-mint px-2.5 py-0.5 text-xs">Đã bật</span>
        ) : null}
      </div>

      {state && state !== 'on' && state !== 'off' ? <p className="text-sm text-pretty text-muted">{EXPLAIN[state]}</p> : null}

      {state === 'on' ? (
        <div className="flex gap-4 text-sm">
          <button type="button" onClick={test} disabled={pending} className="h-9 hover:underline disabled:opacity-60">
            {pending ? 'Đang gửi…' : 'Gửi thử'}
          </button>
          <button type="button" onClick={turnOff} disabled={pending} className="h-9 text-muted hover:text-primary">
            Tắt trên máy này
          </button>
        </div>
      ) : null}

      {message ? (
        <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-muted' : 'text-primary'}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  )
}
