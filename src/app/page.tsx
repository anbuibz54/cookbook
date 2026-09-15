import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import { listRecipes } from '@/server/recipes/service'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { user } = await requireUser()
  const { q } = await searchParams
  const recipes = await listRecipes(db, user.id, { search: q })

  return (
    <AppShell>
      <form className="mb-6">
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Tìm món, nguyên liệu, tag… (không cần dấu)"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus-visible:border-accent"
        />
      </form>

      {recipes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-5 py-10 text-center text-muted">
          {q ? (
            <p>Không có công thức nào khớp “{q}”.</p>
          ) : (
            <div className="space-y-2">
              <p>Chưa có công thức nào.</p>
              <p className="text-sm">
                Vào{' '}
                <Link href="/settings" className="text-accent underline underline-offset-4">
                  Kết nối AI
                </Link>{' '}
                để Claude lưu công thức giúp bạn.
              </p>
            </div>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {recipes.map((r) => (
            <li key={r.id}>
              <Link href={`/recipes/${r.id}`} className="flex flex-col gap-1 py-4 hover:bg-surface">
                <span className="font-medium">{r.title}</span>
                <span className="text-sm text-muted">
                  {[
                    r.prepMinutes || r.cookMinutes
                      ? `${(r.prepMinutes ?? 0) + (r.cookMinutes ?? 0)} phút`
                      : null,
                    r.tags.length ? r.tags.join(' · ') : null,
                    r.authoredBy === 'ai' ? 'AI soạn' : null,
                  ]
                    .filter(Boolean)
                    .join('  ·  ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  )
}
