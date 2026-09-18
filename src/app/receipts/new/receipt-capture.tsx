'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { shrinkPhoto } from '@/lib/photo'
import { readReceiptAction, type ReadReceiptState } from '@/app/_actions/receipts'

/** Receipts are long and the print is small: keep more pixels than a meal photo. */
const RECEIPT_EDGE = 2400

export function ReceiptCapture() {
  const router = useRouter()
  const [preview, setPreview] = useState<string | null>(null)
  const [forBakery, setForBakery] = useState(false)
  const [state, setState] = useState<ReadReceiptState>(null)
  const [pending, start] = useTransition()

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  async function pick(file: File | undefined) {
    if (!file) return
    setState(null)
    let blob: Blob
    try {
      blob = await shrinkPhoto(file, RECEIPT_EDGE)
    } catch {
      setState({ error: 'Không mở được ảnh này. Thử ảnh khác nhé.' })
      return
    }
    setPreview(URL.createObjectURL(blob))
    const form = new FormData()
    form.set('photo', blob, 'receipt.jpg')
    if (forBakery) form.set('forBakery', 'on')
    start(async () => {
      const result = await readReceiptAction(null, form)
      if (result && 'receiptId' in result) router.push(`/receipts/${result.receiptId}`)
      else setState(result)
    })
  }

  const input = (id: string, camera: boolean) => (
    <input
      id={id}
      type="file"
      accept="image/*"
      {...(camera ? { capture: 'environment' as const } : {})}
      className="sr-only"
      disabled={pending}
      onChange={(e) => {
        void pick(e.target.files?.[0])
        e.target.value = ''
      }}
    />
  )

  return (
    <div className="flex flex-col gap-3">
      {input('receipt-camera', true)}
      {input('receipt-library', false)}

      {pending ? (
        <div role="status" className="flex flex-col items-center gap-3 rounded-[20px] border-2 border-ink bg-surface p-5 text-center shadow-pop-sm">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img src={preview} alt="" className="max-h-56 rounded-xl object-contain opacity-70" />
          )}
          <p className="font-medium">AI đang đọc hóa đơn…</p>
          <p className="text-xs text-muted">Hóa đơn dài có thể mất nửa phút.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2.5">
          <label
            htmlFor="receipt-camera"
            className="flex h-[112px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[20px] border-2 border-ink bg-surface font-medium shadow-pop-sm"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            Chụp hóa đơn
          </label>
          <label
            htmlFor="receipt-library"
            className="flex h-[112px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[20px] border-2 border-dashed border-line bg-surface text-sm text-muted hover:border-ink hover:text-ink"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="10" r="2" />
              <path d="M21 16l-5-5-9 9" />
            </svg>
            Chọn từ thư viện
          </label>
        </div>
      )}

      <label className="flex items-start gap-2.5 rounded-[18px] border border-line bg-surface px-3.5 py-3 text-sm">
        <input type="checkbox" checked={forBakery} onChange={(e) => setForBakery(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
        <span>
          <span className="block font-medium">Mua cho tiệm bánh</span>
          <span className="block text-xs text-muted">Giá các món sẽ được gửi sang trang giá vốn của tiệm. Sửa từng dòng được ở bước sau.</span>
        </span>
      </label>

      {state && 'error' in state && (
        <p role="alert" className="rounded-[18px] border-2 border-ink bg-warn-bg px-4 py-3 text-sm text-warn-ink">
          {state.error}{' '}
          {state.settings && (
            <Link href="/settings" className="font-medium underline">
              Mở Cài đặt
            </Link>
          )}
        </p>
      )}
    </div>
  )
}
