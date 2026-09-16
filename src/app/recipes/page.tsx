import Link from 'next/link'
import { TabBar } from '@/components/tab-bar'
import { Thumb } from '@/components/thumb'
import { requireUser } from '@/lib/auth/dal'
import { round } from '@/lib/nutrition'
import { db } from '@/server/db'
import { listRecipeSummaries, tagCounts } from '@/server/recipes/service'

function formatClock(minutes: number | null) {
  if (minutes == null) return '—'
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>
}) {
  const { user } = await requireUser()
  const { q, tag } = await searchParams
  const [recipes, tags] = await Promise.all([
    listRecipeSummaries(db, user.id, { search: q, tag }),
    tagCounts(db, user.id, 8),
  ])
  const total = tags.reduce((sum, t) => sum + t.count, 0)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-[18px] pt-6 pb-6">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-2.5">
          <h1 className="font-display text-[30px] leading-none font-extrabold">Sổ công thức</h1>
          <span className="font-mono text-sm text-muted">{recipes.length}</span>
        </div>
        <Link
          href="/recipes/new"
          aria-label="Thêm công thức"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-primary shadow-pop-sm"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </header>

      <form className="flex h-12 items-center gap-2.5 rounded-full border-2 border-ink bg-surface px-4">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          id="recipes-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Tìm món, nguyên liệu, tag"
          className="w-full bg-transparent outline-none placeholder:text-placeholder"
        />
        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
      </form>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href={q ? `/recipes?q=${encodeURIComponent(q)}` : '/recipes'}
            className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm ${
              tag ? 'border border-line bg-surface' : 'bg-ink font-medium text-background'
            }`}
          >
            Tất cả <span className="font-mono text-xs opacity-70">{total}</span>
          </Link>
          {tags.map((t) => (
            <Link
              key={t.tag}
              href={`/recipes?tag=${encodeURIComponent(t.tag)}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm ${
                t.tag === tag ? 'border border-ink bg-carbs' : 'border border-line bg-surface'
              }`}
            >
              {t.tag} <span className="font-mono text-xs text-muted">{t.count}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {recipes.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-line px-5 py-10 text-center text-muted text-pretty">
          {q || tag ? 'Không có công thức nào khớp.' : 'Chưa có công thức nào trong sổ.'}
        </p>
      ) : (
        <>
          <div className="flex justify-between px-1.5 text-xs text-muted">
            <span>Mới cập nhật</span>
            <span className="flex gap-6">
              <span>Thời gian</span>
              <span>kcal/phần</span>
            </span>
          </div>

          <ul className="rounded-[18px] border border-line bg-surface px-3.5">
            {recipes.map((recipe, i) => (
              <li key={recipe.id} className={i > 0 ? 'border-t border-line-soft' : undefined}>
                <Link
                  href={`/recipes/${recipe.id}`}
                  className="grid grid-cols-[48px_minmax(0,1fr)_50px_44px] items-center gap-2.5 py-3"
                >
                  <Thumb id={recipe.id} className="size-12 rounded-xl" />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{recipe.title}</span>
                    <span className="flex items-center gap-1.5 truncate text-xs text-muted">
                      <span
                        aria-hidden="true"
                        className={`size-[7px] shrink-0 rounded-full ${
                          recipe.nutrition.missing.length === 0 ? 'bg-protein' : 'bg-carbs'
                        }`}
                      />
                      {[recipe.tags[0], recipe.authoredBy === 'ai' ? 'AI soạn' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <span className="text-right font-mono text-[13px] tabular-nums">
                    {formatClock(recipe.totalMinutes)}
                  </span>
                  <span className="text-right font-mono text-[13px] tabular-nums">
                    {recipe.nutrition.counted > 0 ? round(recipe.nutrition.perServing.kcal) : '—'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex gap-4 px-1.5 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-[7px] rounded-full bg-protein" />
              Đủ số liệu dinh dưỡng
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-[7px] rounded-full bg-carbs" />
              Còn thiếu
            </span>
          </div>
        </>
      )}

      <div className="grow" />
      <TabBar />
    </div>
  )
}
