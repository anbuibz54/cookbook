import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { deleteMealAction } from '@/app/_actions/journal'
import { ConfirmForm } from '@/components/confirm-form'
import { PageTransition } from '@/components/page-transition'
import { Thumb } from '@/components/thumb'
import { requireUser } from '@/lib/auth/dal'
import { formatAmount } from '@/lib/amount'
import { photoUrl } from '@/lib/photo-url'
import { dayLabel, timeLabel } from '@/lib/dates'
import { db } from '@/server/db'
import { getMeal, type JournalItem } from '@/server/journal/service'

function amountOf(item: JournalItem) {
  if (item.usedAll) return 'hết'
  return formatAmount(item.quantity, item.unit)
}

/** One logged meal. Right after saving, a banner says what the pantry did. */
export default async function MealPage({ params, searchParams }: PageProps<'/journal/[id]'>) {
  const { user } = await requireUser()
  const { id } = await params
  const query = await searchParams

  const meal = await getMeal(db, user.id, id)
  if (!meal) notFound()
  const { entry, dishes, items } = meal
  const used = items.filter((i) => i.kind === 'used')
  const bought = items.filter((i) => i.kind === 'bought')

  const saved = query.saved === '1'
  const reduced = Number(query.reduced ?? 0)
  const removed = Number(query.removed ?? 0)
  const unchanged = typeof query.unchanged === 'string' ? query.unchanged : null
  const conquered = typeof query.conquered === 'string' ? query.conquered : null

  return (
    <PageTransition>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pt-3 pb-10">
        <header className="flex h-13 items-center">
          <Link
            href="/" transitionTypes={['nav-back']}
            aria-label="Về Hôm nay"
            className="flex size-11 items-center justify-center rounded-full hover:bg-line-soft"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
        </header>

        {saved ? (
          <div role="status" className="flex flex-col gap-1 rounded-[18px] border-2 border-ink bg-tile-mint px-4 py-3 shadow-pop-sm">
            <span className="font-display text-lg font-extrabold">{conquered ? `Chinh phục ${conquered}!` : 'Đã ghi bữa!'}</span>
            <span className="text-sm text-pretty">
              {reduced + removed > 0
                ? `Tủ lạnh: ${[removed ? `bỏ ${removed} món đã hết` : null, reduced ? `trừ bớt ${reduced} món` : null]
                    .filter(Boolean)
                    .join(', ')}.`
                : 'Tủ lạnh không đổi.'}
              {unchanged ? ` Chưa trừ được ${unchanged} vì khác đơn vị với trong tủ, sửa ở Tủ lạnh nhé.` : ''}
            </span>
          </div>
        ) : null}

        <div className="relative aspect-[4/3] overflow-hidden rounded-[20px] border-2 border-ink">
          {entry.photoPath ? (
            <Image src={photoUrl(entry.photoPath)} alt={entry.title} fill unoptimized sizes="448px" className="object-cover" />
          ) : (
            <Thumb id={entry.id} className="size-full" />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[13px] text-muted">
            {dayLabel(entry.cookedOn)} · ghi lúc {timeLabel(entry.createdAt)}
          </span>
          <h1 className="font-display text-[28px] leading-tight font-extrabold text-balance">{entry.title}</h1>
        </div>

        {dishes.some((d) => d.recipeId) ? (
          <ul className="flex flex-wrap gap-1.5">
            {dishes
              .filter((d) => d.recipeId)
              .map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/recipes/${d.recipeId}`} transitionTypes={['nav-forward']}
                    className="flex h-8 items-center rounded-full border border-ink bg-surface px-3 text-[13px] hover:bg-line-soft"
                  >
                    Công thức {d.name} ›
                  </Link>
                </li>
              ))}
          </ul>
        ) : null}

        {entry.note ? <p className="text-[15px] whitespace-pre-line text-pretty">{entry.note}</p> : null}

        <ItemList title="Đã dùng từ tủ lạnh" items={used} amount={amountOf} />
        <ItemList title="Mua thêm" items={bought} amount={amountOf} />

        <ConfirmForm
          action={deleteMealAction.bind(null, entry.id)}
          question="Xoá bữa này khỏi nhật ký? Tủ lạnh sẽ không được cộng lại."
          label="Xoá bữa này"
        />
      </div>
    </PageTransition>
  )
}

function ItemList({
  title,
  items,
  amount,
}: {
  title: string
  items: JournalItem[]
  amount: (item: JournalItem) => string
}) {
  if (items.length === 0) return null
  return (
    <section className="rounded-[18px] border border-line bg-surface px-4 pt-3 pb-1">
      <h2 className="pb-1 font-display text-lg font-bold">{title}</h2>
      <ul>
        {items.map((item, i) => (
          <li
            key={item.id}
            className={`flex items-baseline justify-between gap-3 py-2.5 ${i > 0 ? 'border-t border-line-soft' : ''}`}
          >
            <span className="min-w-0 truncate">{item.name}</span>
            <span className="shrink-0 font-mono text-sm text-muted">{amount(item) || '—'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
