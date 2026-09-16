import Link from 'next/link'
import { TabBar } from '@/components/tab-bar'
import { Thumb } from '@/components/thumb'
import { requireUser } from '@/lib/auth/dal'
import { round } from '@/lib/nutrition'
import { db } from '@/server/db'
import { listRecipeSummaries, tagCounts } from '@/server/recipes/service'

/** Bếp ở Việt Nam, nên ngày tháng theo giờ Việt Nam bất kể máy chủ đặt ở đâu. */
function today() {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date())
}

function formatDuration(minutes: number | null) {
  if (minutes == null) return null
  if (minutes < 60) return `${minutes} phút`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} giờ` : `${hours} giờ ${rest}`
}

/** Ô danh mục: hồng nhạt, hồng đậm, xanh, trắng — lặp lại nếu có nhiều tag hơn. */
const TILE_STYLES = [
  'bg-tile-pink',
  'bg-primary text-white',
  'bg-protein text-white',
  'bg-surface',
]

export default async function HomePage() {
  const { user } = await requireUser()
  const [recent, tags] = await Promise.all([
    listRecipeSummaries(db, user.id, { limit: 3 }),
    tagCounts(db, user.id),
  ])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-[18px] pt-6 pb-6">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] text-muted">{today()}</span>
          <h1 className="font-display text-[32px] leading-tight font-extrabold">Hôm nay nấu gì?</h1>
        </div>
        <Link
          href="/recipes/new"
          aria-label="Thêm công thức"
          className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-primary shadow-pop-sm"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </header>

      <form action="/recipes" className="flex h-[50px] items-center gap-2.5 rounded-full border-2 border-ink bg-surface px-[18px]">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          id="home-search"
          name="q"
          type="search"
          placeholder="Tìm món hoặc nguyên liệu đang có"
          className="w-full bg-transparent outline-none placeholder:text-placeholder"
        />
      </form>

      <Link
        href="/settings"
        className="flex items-center gap-3.5 rounded-[20px] border-2 border-ink bg-protein p-4 text-white shadow-pop"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-surface">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h11v10H4z" />
            <path d="M15 11l5-3v8l-5-3z" />
          </svg>
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="font-display text-[19px] leading-tight font-extrabold">Thấy món hay trong video?</span>
          <span className="text-[13px]">Gửi link cho Claude, công thức tự vào sổ.</span>
        </span>
      </Link>

      {tags.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {tags.map((tag, i) => (
            <Link
              key={tag.tag}
              href={`/recipes?tag=${encodeURIComponent(tag.tag)}`}
              className={`flex h-[86px] flex-col justify-between rounded-[18px] border-2 border-ink px-3.5 py-3 ${TILE_STYLES[i % TILE_STYLES.length]}`}
            >
              <span className="font-display text-xl leading-none font-extrabold first-letter:uppercase">{tag.tag}</span>
              <span className="font-mono text-[13px]">{tag.count} công thức</span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-extrabold">Mới lưu</h2>
        <Link href="/recipes" className="text-[13px] text-muted hover:text-ink">
          Xem tất cả
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-line px-5 py-8 text-center text-muted text-pretty">
          Chưa có công thức nào. Nói với Claude “lưu công thức này” là món đầu tiên vào sổ.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {recent.map((recipe, i) => (
            <li key={recipe.id}>
              <Link
                href={`/recipes/${recipe.id}`}
                className={`grid grid-cols-[84px_minmax(0,1fr)] items-center gap-3 rounded-[18px] bg-surface p-2.5 ${
                  i === 0 ? 'border-2 border-ink shadow-pop' : 'border border-line'
                }`}
              >
                <Thumb id={recipe.id} className="size-[84px] rounded-xl" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[17px] leading-tight font-semibold">{recipe.title}</span>
                  <span className="font-mono text-[13px] text-muted">
                    {[
                      formatDuration(recipe.totalMinutes),
                      recipe.nutrition.counted > 0
                        ? `${round(recipe.nutrition.perServing.kcal)} kcal/phần`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {recipe.authoredBy === 'ai' ? (
                    <span className="self-start rounded-full bg-protein px-2.5 py-px text-xs font-semibold text-white">
                      AI soạn từ video
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="grow" />
      <TabBar />
    </div>
  )
}
