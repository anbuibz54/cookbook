import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Thumb } from '@/components/thumb'
import { requireUser } from '@/lib/auth/dal'
import { CONFIDENCE_LABEL, energyShare, lineKcal, round } from '@/lib/nutrition'
import { db } from '@/server/db'
import { getRecipe } from '@/server/recipes/service'
import { IngredientTable, type IngredientRow } from './ingredient-table'

export default async function RecipePage({ params }: PageProps<'/recipes/[id]'>) {
  const { user } = await requireUser()
  const { id } = await params
  const full = await getRecipe(db, user.id, id)
  if (!full) notFound()

  const { recipe, ingredients, steps, nutrition } = full
  const perServing = nutrition.perServing
  const share = energyShare(perServing)

  const rows: IngredientRow[] = ingredients.map((line) => ({
    id: line.id,
    section: line.section,
    name: line.name,
    quantity: line.quantity,
    quantityMax: line.quantityMax,
    unit: line.unit,
    note: line.note,
    optional: line.optional,
    grams: line.grams,
    kcal: lineKcal(line),
    linked: line.food != null,
  }))

  const macros = [
    { label: 'Đạm', value: perServing.proteinG, pct: share.proteinPct, color: 'bg-protein' },
    { label: 'Béo', value: perServing.fatG, pct: share.fatPct, color: 'bg-fat' },
    { label: 'Tinh bột', value: perServing.carbsG, pct: share.carbsPct, color: 'bg-carbs' },
  ]

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 px-4 pt-2 pb-10">
      <header className="flex h-13 items-center justify-between">
        <Link href="/recipes" aria-label="Về sổ công thức" className="flex size-11 items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <span className="text-sm text-muted">{recipe.tags[0] ?? recipe.cuisine ?? 'Công thức'}</span>
        <span className="size-11" />
      </header>

      <div className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-3.5">
        <Thumb id={recipe.id} className="size-25 rounded-2xl border-2 border-ink" />
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-balance">
            {recipe.title}
          </h1>
          {recipe.prepMinutes != null || recipe.cookMinutes != null ? (
            <span className="font-mono text-xs text-muted">
              {[
                recipe.prepMinutes != null ? `${recipe.prepMinutes}′ chuẩn bị` : null,
                recipe.cookMinutes != null ? `${recipe.cookMinutes}′ nấu` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}
          {recipe.authoredBy === 'ai' ? (
            <span className="self-start rounded-full bg-protein px-2.5 py-px text-xs font-semibold text-white">
              AI soạn{recipe.sourceUrl ? ' từ video' : ''}
            </span>
          ) : null}
        </div>
      </div>

      {recipe.summary ? <p className="px-1 text-pretty text-muted">{recipe.summary}</p> : null}

      <section className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[19px] font-bold">
            Mỗi {recipe.yieldLabel ?? 'phần'} có gì
          </h2>
          <span className="rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-medium text-warn-ink">
            {CONFIDENCE_LABEL[nutrition.confidence]}
          </span>
        </div>

        {nutrition.counted === 0 ? (
          <p className="text-pretty text-muted">
            Chưa tính được: chưa nguyên liệu nào có số liệu dinh dưỡng.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[44px] leading-none font-medium tracking-tight tabular-nums">
                {round(perServing.kcal)}
              </span>
              <span className="text-sm text-muted">kcal</span>
            </div>

            <div className="flex h-3 gap-0.5 overflow-hidden rounded-md" aria-hidden="true">
              {macros.map((m) => (
                <div key={m.label} className={m.color} style={{ width: `${m.pct}%` }} />
              ))}
            </div>

            <dl className="grid grid-cols-3 gap-2">
              {macros.map((m) => (
                <div key={m.label} className="flex flex-col gap-0.5">
                  <dt className="flex items-center gap-1.5 text-xs text-muted">
                    <span aria-hidden="true" className={`size-2 rounded-full ${m.color}`} />
                    {m.label}
                  </dt>
                  <dd className="font-mono text-lg tabular-nums">{round(m.value, 1)} g</dd>
                  <dd className="font-mono text-[11px] text-muted">{m.pct}% năng lượng</dd>
                </div>
              ))}
            </dl>

            <div className="flex gap-5 border-t border-line-soft pt-3 text-[13px] text-muted">
              <span>
                Đường <span className="font-mono text-ink tabular-nums">{round(perServing.sugarG, 1)} g</span>
              </span>
              <span>
                Natri <span className="font-mono text-ink tabular-nums">{round(perServing.sodiumMg)} mg</span>
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-muted">
                <span>Nguyên liệu đã có số liệu</span>
                <span className="font-mono tabular-nums">
                  {nutrition.counted}/{nutrition.countable}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-line-soft">
                <div
                  className="h-1.5 rounded-full bg-ink"
                  style={{ width: `${Math.round((nutrition.counted / nutrition.countable) * 100)}%` }}
                />
              </div>
              {nutrition.missing.length > 0 ? (
                <p className="text-xs text-pretty text-muted">
                  Chưa tính: {nutrition.missing.join(', ')}.
                </p>
              ) : null}
            </div>
          </>
        )}
      </section>

      <IngredientTable rows={rows} baseServings={recipe.servings} yieldLabel={recipe.yieldLabel} />

      <section className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[19px] font-bold">Cách làm</h2>
          <span className="font-mono text-xs text-muted">{steps.length} bước</span>
        </div>
        <ol className="flex flex-col gap-3.5">
          {steps.map((step, i) => (
            <li key={step.id}>
              {step.section && step.section !== steps[i - 1]?.section ? (
                <div className="pb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
                  {step.section}
                </div>
              ) : null}
              <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                <span
                  className={`flex size-7 items-center justify-center rounded-[9px] font-mono text-[13px] ${
                    i === 0 ? 'bg-ink text-background' : 'bg-background'
                  }`}
                >
                  {i + 1}
                </span>
                <div className="flex flex-col items-start gap-2">
                  <p className="text-pretty">{step.body}</p>
                  {step.timerSeconds ? (
                    <span className="flex h-8.5 items-center gap-1.5 rounded-[10px] bg-fat px-3 font-mono text-[13px] text-white">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                      {Math.round(step.timerSeconds / 60)} phút
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {steps.length > 0 ? (
        <Link
          href={`/recipes/${recipe.id}/cook`}
          className="flex h-14 items-center justify-center gap-2 rounded-full border-2 border-ink bg-ink font-display text-[19px] font-extrabold text-background shadow-pop-primary"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5l11 7-11 7z" />
          </svg>
          Nấu thôi
        </Link>
      ) : null}

      {recipe.notes ? (
        <section className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-4">
          <h2 className="font-display text-[19px] font-bold">Ghi chú</h2>
          <p className="whitespace-pre-wrap text-pretty">{recipe.notes}</p>
        </section>
      ) : null}

      {recipe.sourceUrl || recipe.sourceLabel ? (
        <p className="px-1 text-xs text-muted">
          Nguồn:{' '}
          {recipe.sourceUrl ? (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-4"
            >
              {recipe.sourceLabel ?? recipe.sourceUrl}
            </a>
          ) : (
            recipe.sourceLabel
          )}
        </p>
      ) : null}
    </div>
  )
}
