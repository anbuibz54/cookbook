import Link from 'next/link'
import { PageTransition } from '@/components/page-transition'
import { addMissingToShoppingAction } from '@/app/_actions/kitchen'
import { requireUser } from '@/lib/auth/dal'
import { formatQuantity } from '@/lib/units'
import { db } from '@/server/db'
import { listPantry, suggestFromPantry } from '@/server/pantry/service'
import { vnDate } from '@/lib/dates'
import { PantryAddForm, PantryItemRow } from './pantry-editor'

/** Days at which a date starts being worth shouting about. */
const SOON = 3

function expiry(date: string | null) {
  if (!date) return null
  const days = Math.round((new Date(`${date}T00:00:00`).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { label: 'quá hạn', urgent: true }
  if (days === 0) return { label: 'hết hạn hôm nay', urgent: true }
  if (days <= SOON) return { label: `còn ${days} ngày`, urgent: true }
  return { label: `HSD ${date.slice(8, 10)}/${date.slice(5, 7)}`, urgent: false }
}

export default async function PantryPage() {
  const { user } = await requireUser()
  const [items, suggestions] = await Promise.all([
    listPantry(db, user.id),
    suggestFromPantry(db, user.id, { limit: 8 }),
  ])

  const cookable = suggestions.filter((s) => s.missing.length === 0)
  const nearly = suggestions.filter((s) => s.missing.length > 0)

  return (
    <PageTransition>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-[18px] pt-6 pb-32">
        <header className="flex items-baseline justify-between">
          <h1 className="font-display text-[30px] leading-none font-extrabold">Tủ lạnh</h1>
          <span className="font-mono text-sm text-muted">{items.length}</span>
        </header>

        <PantryAddForm today={vnDate()} />

        {items.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-line px-5 py-8 text-center text-pretty text-muted">
            Chưa ghi gì trong tủ. Bấm “Thêm đồ vào tủ”, hoặc nói với Claude “tủ còn 5 quả trứng, nửa bó hành,
            300g thịt ba chỉ, sữa tươi hạn 20/9”.
          </p>
        ) : (
          <ul className="rounded-[18px] border border-line bg-surface px-3.5">
            {items.map((item, i) => (
              <PantryItemRow
                key={`${item.id}:${item.quantity}:${item.unit}:${item.expiresOn}`}
                first={i === 0}
                item={{
                  id: item.id,
                  name: item.name,
                  amount: item.quantity != null ? `${formatQuantity(item.quantity)}${item.unit ? ` ${item.unit}` : ''}` : '',
                  expiresOn: item.expiresOn,
                  expiry: expiry(item.expiresOn),
                  note: item.note,
                }}
              />
            ))}
          </ul>
        )}

        {suggestions.length > 0 ? (
          <>
            <h2 className="font-display text-2xl font-extrabold">Nấu được gì</h2>

            {cookable.map((s) => (
              <Link
                key={s.recipeId}
                href={`/recipes/${s.recipeId}`} transitionTypes={['nav-forward']}
                className="flex flex-col gap-2 rounded-[18px] border-2 border-ink bg-protein p-4 text-white shadow-pop"
              >
                <span className="font-display text-xl leading-tight font-extrabold">{s.title}</span>
                <span className="text-[13px]">
                  Đủ nguyên liệu{s.totalMinutes ? ` · ${s.totalMinutes} phút` : ''}
                </span>
                {s.usesExpiring.length > 0 ? (
                  <span className="self-start rounded-full bg-white/20 px-2.5 py-0.5 text-xs">
                    Dùng hết {s.usesExpiring.join(', ')} đang sắp hỏng
                  </span>
                ) : null}
              </Link>
            ))}

            {nearly.map((s) => (
              <div key={s.recipeId} className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/recipes/${s.recipeId}`} transitionTypes={['nav-forward']} className="font-medium">
                    {s.title}
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {s.have}/{s.needed}
                  </span>
                </div>
                <p className="text-[13px] text-pretty text-muted">
                  Thiếu{' '}
                  {s.missing
                    .map((m) => `${m.name}${m.short ? ' (không đủ)' : ''}`)
                    .join(', ')}
                  .
                </p>
                {s.usesExpiring.length > 0 ? (
                  <span className="self-start rounded-full bg-warn-bg px-2.5 py-0.5 text-xs text-warn-ink">
                    Dùng được {s.usesExpiring.join(', ')} sắp hỏng
                  </span>
                ) : null}
                <form action={addMissingToShoppingAction.bind(null, s.recipeId)}>
                  <button
                    type="submit"
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-surface text-sm font-medium"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Thêm {s.missing.length} món thiếu vào đi chợ
                  </button>
                </form>
              </div>
            ))}
          </>
        ) : items.length > 0 ? (
          <p className="text-pretty text-muted">
            Chưa công thức nào trong sổ dùng những thứ này. Nhờ Claude lưu thêm công thức, hoặc hỏi
            “nấu gì với đồ đang có?”.
          </p>
        ) : null}
      </div>
    </PageTransition>
  )
}
