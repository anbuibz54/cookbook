import { notFound } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { requireUser } from '@/lib/auth/dal'
import { CONFIDENCE_LABEL, round } from '@/lib/nutrition'
import { formatQuantity } from '@/lib/units'
import { db } from '@/server/db'
import { getRecipe } from '@/server/recipes/service'

function groupBySection<T extends { section: string | null }>(items: T[]) {
  const groups: { section: string | null; items: T[] }[] = []
  for (const item of items) {
    const last = groups.at(-1)
    if (last && last.section === item.section) last.items.push(item)
    else groups.push({ section: item.section, items: [item] })
  }
  return groups
}

export default async function RecipePage({ params }: PageProps<'/recipes/[id]'>) {
  const { user } = await requireUser()
  const { id } = await params
  const full = await getRecipe(db, user.id, id)
  if (!full) notFound()

  const { recipe, ingredients, steps, nutrition } = full
  const p = nutrition.perServing
  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)

  return (
    <AppShell>
      <article className="space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold text-balance">{recipe.title}</h1>
          {recipe.summary ? <p className="text-muted">{recipe.summary}</p> : null}
          <p className="text-sm text-muted">
            {[
              `${formatQuantity(recipe.servings)} ${recipe.yieldLabel ?? 'phần'}`,
              totalMinutes ? `${totalMinutes} phút` : null,
              recipe.cuisine,
              ...recipe.tags,
            ]
              .filter(Boolean)
              .join('  ·  ')}
          </p>
          {recipe.sourceUrl || recipe.sourceLabel ? (
            <p className="text-sm text-muted">
              Nguồn:{' '}
              {recipe.sourceUrl ? (
                <a href={recipe.sourceUrl} className="text-accent underline underline-offset-4" target="_blank" rel="noreferrer">
                  {recipe.sourceLabel ?? recipe.sourceUrl}
                </a>
              ) : (
                recipe.sourceLabel
              )}
            </p>
          ) : null}
        </header>

        <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Dinh dưỡng mỗi {recipe.yieldLabel ?? 'phần'}</h2>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
              {CONFIDENCE_LABEL[nutrition.confidence]}
            </span>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
            {[
              ['Năng lượng', `${round(p.kcal)} kcal`],
              ['Đạm', `${round(p.proteinG, 1)} g`],
              ['Béo', `${round(p.fatG, 1)} g`],
              ['Tinh bột', `${round(p.carbsG, 1)} g`],
              ['Đường', `${round(p.sugarG, 1)} g`],
              ['Natri', `${round(p.sodiumMg)} mg`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">
            Tính từ {nutrition.counted}/{nutrition.countable} nguyên liệu.
            {nutrition.missing.length ? ` Chưa tính: ${nutrition.missing.join(', ')}.` : ''}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Nguyên liệu</h2>
          {groupBySection(ingredients).map((group, gi) => (
            <div key={gi} className="space-y-2">
              {group.section ? <h3 className="text-sm font-semibold text-muted uppercase">{group.section}</h3> : null}
              <ul className="space-y-1.5">
                {group.items.map((i) => (
                  <li key={i.id} className="flex gap-3">
                    <span className="w-24 shrink-0 text-right tabular-nums text-muted">
                      {i.quantity != null
                        ? `${formatQuantity(i.quantity)}${i.quantityMax != null ? `–${formatQuantity(i.quantityMax)}` : ''}${i.unit ? ` ${i.unit}` : ''}`
                        : 'vừa ăn'}
                    </span>
                    <span>
                      {i.name}
                      {i.note ? <span className="text-muted">, {i.note}</span> : null}
                      {i.optional ? <span className="text-muted"> (tùy thích)</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Cách làm</h2>
          {groupBySection(steps).map((group, gi) => (
            <div key={gi} className="space-y-2">
              {group.section ? <h3 className="text-sm font-semibold text-muted uppercase">{group.section}</h3> : null}
              <ol className="list-decimal space-y-3 pl-6 marker:text-muted">
                {group.items.map((s) => (
                  <li key={s.id} className="pl-1 leading-relaxed">
                    {s.body}
                    {s.timerSeconds ? (
                      <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
                        ⏱ {Math.round(s.timerSeconds / 60)} phút
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>

        {recipe.notes ? (
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Ghi chú</h2>
            <p className="whitespace-pre-wrap leading-relaxed">{recipe.notes}</p>
          </section>
        ) : null}
      </article>
    </AppShell>
  )
}
