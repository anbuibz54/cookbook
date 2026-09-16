import Image from 'next/image'
import Link from 'next/link'
import { deleteGoalAction, deleteWishAction } from '@/app/_actions/motivation'
import { ConfirmForm } from '@/components/confirm-form'
import { PageTransition } from '@/components/page-transition'
import { StreakCard } from '@/components/streak-card'
import { Thumb } from '@/components/thumb'
import { requireUser } from '@/lib/auth/dal'
import { photoUrl } from '@/lib/photo-url'
import { db } from '@/server/db'
import {
  dishHistory,
  goalCards,
  monthStats,
  photoWall,
  STREAK_PRESETS,
  streakCards,
  wishCards,
} from '@/server/motivation/service'

function SectionHead({ title, href, action }: { title: string; href?: string; action?: string }) {
  return (
    <div className="flex items-baseline justify-between pt-1">
      <h2 className="font-display text-2xl font-extrabold">{title}</h2>
      {href && action ? (
        <Link href={href} transitionTypes={['nav-forward']} className="text-[13px] text-primary hover:underline">
          {action}
        </Link>
      ) : null}
    </div>
  )
}

function shortDate(day: string) {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`
}

/** "Thành tích": streaks, goals, the wish board and the photo wall. */
export default async function AchievementsPage() {
  const { user } = await requireUser()
  const history = await dishHistory(db, user.id)
  const [streaks, goals, wishes, stats, wall] = await Promise.all([
    streakCards(db, user.id, { history }),
    goalCards(db, user.id, { history }),
    wishCards(db, user.id),
    monthStats(db, user.id, history),
    photoWall(db, user.id, { limit: 9 }),
  ])
  const longest = Math.max(0, ...streaks.filter((s) => s.unit === 'ngày').map((s) => s.best))

  return (
    <PageTransition>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-[18px] pt-6 pb-32">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[32px] leading-none font-extrabold">Thành tích</h1>
          <Link
            href="/share"
            transitionTypes={['nav-forward']}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink bg-surface px-3.5 text-[13px] font-medium shadow-pop-sm"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12M7 8l5-5 5 5" />
              <path d="M5 14v6h14v-6" />
            </svg>
            Chia sẻ tháng {stats.month}
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {[
            [stats.meals, `bữa tháng ${stats.month}`],
            [stats.newDishes, 'món mới'],
            [longest, 'ngày dài nhất'],
          ].map(([value, label]) => (
            <div key={label} className="flex flex-col gap-0.5 rounded-2xl border border-line bg-surface p-3">
              <span className="font-mono text-[26px] leading-none font-medium">{value}</span>
              <span className="text-xs text-muted">{label}</span>
            </div>
          ))}
        </div>

        <SectionHead title="Streak" href="/streaks/new" action="+ Tạo streak" />
        {streaks.length === 0 ? (
          <div className="flex flex-col gap-2.5 rounded-[18px] border border-dashed border-line p-4">
            <p className="text-sm text-pretty text-muted">Chưa có streak nào. Bắt đầu nhanh với một cái có sẵn:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(STREAK_PRESETS).map(([key, preset]) => (
                <Link
                  key={key}
                  href={`/streaks/new?preset=${key}`}
                  transitionTypes={['nav-forward']}
                  className="flex h-9 items-center rounded-full border border-ink bg-surface px-3.5 text-sm hover:bg-line-soft"
                >
                  + {preset.name}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {streaks.map((card) => (
              <StreakCard key={card.id} card={card} />
            ))}
          </div>
        )}

        <SectionHead title="Mục tiêu" href="/goals/new" action="+ Thêm mục tiêu" />
        {goals.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-line px-4 py-5 text-sm text-pretty text-muted">
            Ví dụ: “Tháng này nấu 20 bữa”, “10 món bánh trước Tết”. App tự đếm từ nhật ký.
          </p>
        ) : (
          <ul className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface px-4 py-3.5">
            {goals.map((goal) => {
              const ratio = Math.min(1, goal.progress / goal.target)
              return (
                <li key={goal.id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">{goal.title}</span>
                    <span className="shrink-0 font-mono text-[13px]">
                      {goal.progress}/{goal.target}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-line-soft">
                    <div
                      className={`h-2.5 rounded-full ${goal.done ? 'bg-protein' : goal.metric === 'tagged' ? 'bg-carbs' : 'bg-primary'}`}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>
                      {goal.done
                        ? 'Đạt rồi!'
                        : goal.daysLeft < 0
                          ? `Đã hết hạn ${shortDate(goal.endsOn)}`
                          : goal.daysLeft === 0
                            ? 'Hôm nay là ngày cuối'
                            : `Còn ${goal.daysLeft} ngày · đến ${shortDate(goal.endsOn)}`}
                    </span>
                    <ConfirmForm
                      action={deleteGoalAction.bind(null, goal.id)}
                      question={`Xoá mục tiêu “${goal.title}”?`}
                      label="Xoá"
                      pendingLabel="…"
                      className="h-8 px-2 text-xs text-muted hover:text-primary"
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <SectionHead title="Muốn chinh phục" href="/wishes/new" action="+ Ghim món" />
        <ul className="grid grid-cols-2 gap-3">
          {wishes.map((wish, i) => {
            const conquered = wish.conqueredEntryId != null
            const href = conquered
              ? `/journal/${wish.conqueredEntryId}`
              : wish.recipeId
                ? `/recipes/${wish.recipeId}`
                : null
            const body = (
              <>
                <div className="relative h-[120px]">
                  {conquered && wish.conqueredPhoto ? (
                    <Image src={photoUrl(wish.conqueredPhoto)} alt={wish.title} fill unoptimized sizes="200px" className="object-cover" />
                  ) : (
                    <Thumb id={wish.id} className="size-full" />
                  )}
                  {conquered ? (
                    <span className="absolute top-2 right-2 rotate-6 rounded-full border-2 border-ink bg-protein px-2 py-0.5 text-[11px] font-semibold text-white">
                      Đã chinh phục
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col px-2.5 py-2">
                  <span className="line-clamp-2 text-sm leading-snug font-semibold">{wish.title}</span>
                  <span className="truncate text-[11px] text-muted">
                    {conquered && wish.conqueredOn
                      ? `nấu ${shortDate(wish.conqueredOn)}${wish.conqueredPhoto ? ' · ảnh của bạn' : ''}`
                      : wish.recipeId
                        ? 'có trong sổ'
                        : wish.sourceUrl
                          ? new URL(wish.sourceUrl).hostname.replace(/^www\./, '')
                          : (wish.note ?? 'chưa có công thức')}
                  </span>
                </div>
              </>
            )
            const tilt = conquered ? '' : i % 2 === 0 ? '-rotate-1' : 'rotate-1'
            return (
              <li
                key={wish.id}
                className={`relative overflow-hidden rounded-[18px] bg-surface ${conquered ? 'border border-line' : `border-2 border-ink ${tilt}`}`}
              >
                {href ? (
                  <Link href={href} transitionTypes={['nav-forward']} className="block">
                    {body}
                  </Link>
                ) : wish.sourceUrl ? (
                  <a href={wish.sourceUrl} target="_blank" rel="noreferrer" className="block">
                    {body}
                  </a>
                ) : (
                  body
                )}
                {conquered ? null : (
                  <div className="absolute top-1.5 left-1.5">
                    <ConfirmForm
                      action={deleteWishAction.bind(null, wish.id)}
                      question={`Bỏ “${wish.title}” khỏi bảng?`}
                      label="×"
                      pendingLabel="…"
                      ariaLabel={`Bỏ ${wish.title}`}
                      className="flex size-8 items-center justify-center rounded-full bg-surface/90 text-muted hover:text-primary"
                    />
                  </div>
                )}
              </li>
            )
          })}
          <li>
            <Link
              href="/wishes/new"
              transitionTypes={['nav-forward']}
              className="flex h-full min-h-[170px] items-center justify-center rounded-[18px] border-2 border-dashed border-line p-3 text-center text-[13px] text-muted hover:border-ink hover:text-ink"
            >
              Dán link video hoặc chọn từ sổ
            </Link>
          </li>
        </ul>

        <div className="flex items-baseline justify-between pt-1">
          <h2 className="font-display text-2xl font-extrabold">Bức tường ảnh</h2>
          <span className="text-[13px] text-muted">
            Tháng {stats.month} · {wall.thisMonth} ảnh
          </span>
        </div>
        {wall.photos.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-line px-4 py-5 text-sm text-pretty text-muted">
            Ghi bữa kèm ảnh là ảnh lên tường.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
            {wall.photos.map((photo) => (
              <li key={photo.id} className="relative aspect-square">
                <Link href={`/journal/${photo.id}`} transitionTypes={['nav-forward']} className="block size-full">
                  <Image src={photoUrl(photo.photoPath)} alt={photo.title} fill unoptimized sizes="130px" className="object-cover" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageTransition>
  )
}
