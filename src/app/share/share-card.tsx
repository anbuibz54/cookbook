'use client'

import { useEffect, useState } from 'react'

/**
 * Fetches the card PNG up front, so the tap on "Chia sẻ" can call the share
 * sheet immediately: iOS only opens it inside the tap, and a network wait in
 * between loses the gesture.
 *
 * Share sheet where the browser can share files (iPhone: Zalo, Instagram,
 * Lưu ảnh); a plain download everywhere else.
 */
export function ShareCard({ month }: { month: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    let objectUrl: string | null = null
    fetch(`/api/share/month?m=${month}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.blob()
      })
      .then((blob) => {
        if (!alive) return
        objectUrl = URL.createObjectURL(blob)
        setFile(new File([blob], `so-cong-thuc-${month}.png`, { type: 'image/png' }))
        setUrl(objectUrl)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [month])

  const canShareFiles =
    file != null && typeof navigator !== 'undefined' && 'canShare' in navigator && navigator.canShare({ files: [file] })

  async function share() {
    if (!file) return
    setNote(null)
    try {
      await navigator.share({ files: [file], title: 'Tháng này nhà mình nấu' })
    } catch (error) {
      // Closing the sheet is not an error worth showing.
      if ((error as DOMException).name !== 'AbortError') setNote('Không mở được bảng chia sẻ, thử “Lưu ảnh” nhé.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] border-2 border-ink bg-line-soft">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a generated blob, nothing to optimise
          <img src={url} alt={`Thẻ tổng kết tháng ${month}`} className="size-full" />
        ) : (
          <div role="status" className="flex size-full items-center justify-center text-sm text-muted motion-safe:animate-pulse">
            {failed ? 'Không tạo được thẻ, thử lại sau nhé.' : 'Đang vẽ thẻ…'}
          </div>
        )}
      </div>

      <div className={`grid gap-2.5 ${canShareFiles ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1'}`}>
        {canShareFiles ? (
          <button
            type="button"
            onClick={share}
            className="flex h-14 items-center justify-center rounded-full border-2 border-ink bg-ink font-display text-xl font-extrabold text-background shadow-pop-primary"
          >
            Chia sẻ
          </button>
        ) : null}
        {url && file ? (
          <a
            href={url}
            download={file.name}
            className={`flex h-14 items-center justify-center rounded-full border-2 border-ink px-5 font-medium ${
              canShareFiles ? 'bg-surface' : 'bg-ink font-display text-xl font-extrabold text-background shadow-pop-primary'
            }`}
          >
            Lưu ảnh
          </a>
        ) : null}
      </div>

      {note ? (
        <p role="alert" className="text-center text-sm text-primary">
          {note}
        </p>
      ) : null}
    </div>
  )
}
