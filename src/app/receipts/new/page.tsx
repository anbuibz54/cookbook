import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import { listReceipts } from '@/server/receipts/service'
import { ReceiptCapture } from './receipt-capture'

export const metadata: Metadata = { title: 'Chụp hóa đơn' }

export default async function NewReceiptPage({ searchParams }: PageProps<'/receipts/new'>) {
  const { user } = await requireUser()
  const [{ tu }, recent] = await Promise.all([searchParams, listReceipts(db, user.id, 8)])
  const back = tu === 'shopping' ? '/shopping' : '/pantry'

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pt-3 pb-32">
      <header className="grid h-13 grid-cols-[64px_minmax(0,1fr)_64px] items-center">
        <Link href={back} transitionTypes={['nav-back']} className="py-3 text-muted hover:text-ink">
          Hủy
        </Link>
        <h1 className="text-center font-display text-xl font-extrabold">Chụp hóa đơn</h1>
      </header>

      <p className="text-sm text-pretty text-muted">
        Chụp hóa đơn Bách Hóa Xanh, siêu thị hay chợ. AI đọc từng món, bạn kiểm lại, rồi một nút là đồ vào tủ lạnh và danh sách đi chợ tự
        tick.
      </p>

      <ReceiptCapture />

      {recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-extrabold">Hóa đơn gần đây</h2>
          <ul className="rounded-[18px] border border-line bg-surface px-3.5">
            {recent.map((r, i) => (
              <li key={r.id} className={i ? 'border-t border-line' : ''}>
                <Link href={`/receipts/${r.id}`} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.storeName ?? 'Hóa đơn'}</span>
                    <span className="block text-xs text-muted">
                      {r.boughtOn.slice(8, 10)}/{r.boughtOn.slice(5, 7)}
                      {r.totalVnd != null && ` · ${r.totalVnd.toLocaleString('vi-VN')}đ`}
                    </span>
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${r.appliedAt ? 'bg-tile-mint' : 'bg-warn-bg text-warn-ink'}`}>
                    {r.appliedAt ? 'đã vào tủ' : 'chờ kiểm'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
