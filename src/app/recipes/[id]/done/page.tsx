import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { deductAfterCookingAction } from '@/app/_actions/kitchen'
import { requireUser } from '@/lib/auth/dal'
import { round } from '@/lib/nutrition'
import { formatQuantity } from '@/lib/units'
import { db } from '@/server/db'
import { pantryUsedBy } from '@/server/pantry/service'
import { getRecipe } from '@/server/recipes/service'

/**
 * After cooking: what to take out of the fridge.
 *
 * Everything is ticked by default, because that is the common case, but the
 * cook decides — half a bunch of hành lá usually survives the meal, and a
 * pantry that quietly lies is worse than one that is a day out of date.
 */
export default async function CookedPage({ params }: PageProps<'/recipes/[id]/done'>) {
  const { user } = await requireUser()
  const { id } = await params

  const full = await getRecipe(db, user.id, id)
  if (!full) notFound()

  const used = await pantryUsedBy(db, user.id, id)
  // Nothing of this recipe was tracked in the pantry; no question to ask.
  if (used.length === 0) redirect(`/recipes/${id}`)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-[18px] pt-8 pb-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[30px] leading-tight font-extrabold text-balance">
          Nấu xong {full.recipe.title}
        </h1>
        <p className="text-pretty text-muted">
          Bỏ tick thứ nào còn dư, những thứ còn lại sẽ trừ khỏi tủ lạnh.
        </p>
      </header>

      <form action={deductAfterCookingAction.bind(null, id)} className="flex flex-col gap-5">
        <ul className="rounded-[18px] border border-line bg-surface px-3.5">
          {used.map((entry, i) => (
            <li key={entry.item.id} className={i > 0 ? 'border-t border-line-soft' : undefined}>
              <label className="flex cursor-pointer items-center gap-3 py-3">
                <input
                  type="checkbox"
                  name="item"
                  value={entry.item.id}
                  defaultChecked
                  className="size-5 shrink-0 accent-[var(--primary)]"
                />
                <span className="flex min-w-0 grow flex-col gap-0.5">
                  <span className="truncate font-medium">{entry.item.name}</span>
                  <span className="truncate text-xs text-muted">
                    {entry.item.quantity != null
                      ? `trong tủ: ${formatQuantity(entry.item.quantity)}${entry.item.unit ? ` ${entry.item.unit}` : ''}`
                      : 'trong tủ'}
                    {entry.needGrams != null ? ` · công thức dùng ~${round(entry.needGrams)} g` : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <p className="px-1 text-xs text-pretty text-muted">
          Thứ nào cân được thì trừ theo gram và giữ lại phần dư; thứ không cân được thì bỏ khỏi tủ.
        </p>

        <button
          type="submit"
          className="flex h-14 items-center justify-center rounded-full border-2 border-ink bg-ink font-display text-[19px] font-extrabold text-background shadow-pop-primary"
        >
          Cập nhật tủ lạnh
        </button>
      </form>

      <Link href={`/recipes/${id}`} className="text-center text-sm text-muted hover:text-ink">
        Để sau
      </Link>
    </div>
  )
}
