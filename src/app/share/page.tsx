import Link from 'next/link'
import { PageTransition } from '@/components/page-transition'
import { requireUser } from '@/lib/auth/dal'
import { vnDate } from '@/lib/dates'
import { MONTH, shiftMonth } from '@/server/motivation/recap'
import { ShareCard } from './share-card'

/** Preview this month's card (or `?m=YYYY-MM`), then share or save it. */
export default async function SharePage({ searchParams }: PageProps<'/share'>) {
  await requireUser()
  const { m } = await searchParams
  const thisMonth = vnDate().slice(0, 7)
  const month = typeof m === 'string' && MONTH.test(m) && m <= thisMonth ? m : thisMonth
  const prev = shiftMonth(month, -1)
  const next = shiftMonth(month, 1)

  return (
    <PageTransition>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-[18px] pt-3 pb-10">
        <header className="grid h-13 grid-cols-[64px_minmax(0,1fr)_64px] items-center">
          <Link href="/achievements" transitionTypes={['nav-back']} className="py-3 text-muted hover:text-ink">
            Xong
          </Link>
          <h1 className="text-center font-display text-xl font-extrabold">Thẻ tháng</h1>
        </header>

        <nav aria-label="Chọn tháng" className="flex items-center justify-between">
          <Link href={`/share?m=${prev}`} className="flex h-10 items-center px-2 text-sm text-muted hover:text-ink">
            ‹ Tháng {Number(prev.slice(5))}
          </Link>
          <span className="font-mono text-sm">
            {month.slice(5)}/{month.slice(0, 4)}
          </span>
          {next <= thisMonth ? (
            <Link href={`/share?m=${next}`} className="flex h-10 items-center px-2 text-sm text-muted hover:text-ink">
              Tháng {Number(next.slice(5))} ›
            </Link>
          ) : (
            <span className="w-20" />
          )}
        </nav>

        <ShareCard key={month} month={month} />
      </div>
    </PageTransition>
  )
}
