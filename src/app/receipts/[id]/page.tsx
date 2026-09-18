import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/dal'
import { photoUrl } from '@/lib/photo-url'
import { db } from '@/server/db'
import { amountText, getReceipt } from '@/server/receipts/service'
import { ReceiptReview } from './receipt-review'

export const metadata: Metadata = { title: 'Kiểm hóa đơn' }

export default async function ReceiptPage({ params }: PageProps<'/receipts/[id]'>) {
  const { user } = await requireUser()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const data = await getReceipt(db, user.id, id)
  if (!data) notFound()
  const { receipt, lines, shopping } = data

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pt-3 pb-32">
      <header className="grid h-13 grid-cols-[64px_minmax(0,1fr)_64px] items-center">
        <Link href="/receipts/new" transitionTypes={['nav-back']} className="py-3 text-muted hover:text-ink">
          Quay lại
        </Link>
        <h1 className="text-center font-display text-xl font-extrabold">{receipt.appliedAt ? 'Hóa đơn' : 'Kiểm hóa đơn'}</h1>
      </header>

      {receipt.photoPath && (
        <details className="rounded-[18px] border border-line bg-surface px-3.5 py-2.5 text-sm">
          <summary className="cursor-pointer font-medium">Xem ảnh hóa đơn</summary>
          {/* eslint-disable-next-line @next/next/no-img-element -- owner-checked photo route */}
          <img src={photoUrl(receipt.photoPath)} alt="Ảnh hóa đơn" className="mt-2 w-full rounded-xl" />
        </details>
      )}

      <ReceiptReview
        receipt={{
          id: receipt.id,
          storeName: receipt.storeName ?? '',
          storeKind: receipt.storeKind,
          boughtOn: receipt.boughtOn,
          totalVnd: receipt.totalVnd,
          applied: Boolean(receipt.appliedAt),
        }}
        lines={lines.map((l) => ({
          id: l.id,
          rawText: l.rawText,
          name: l.name,
          amount: amountText(l.quantity, l.unit),
          priceVnd: l.priceVnd,
          kind: l.kind,
          toPantry: l.toPantry,
          shoppingItemId: l.shoppingItemId,
          forBakery: l.forBakery,
        }))}
        shopping={shopping.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  )
}
