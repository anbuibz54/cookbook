import Image from 'next/image'
import Link from 'next/link'
import { PageTransition } from '@/components/page-transition'
import { Thumb } from '@/components/thumb'
import { requireUser } from '@/lib/auth/dal'
import { dayLabel, timeLabel, vnDate } from '@/lib/dates'
import { photoUrl } from '@/lib/photo-url'
import { db } from '@/server/db'
import { listJournal, mealCounts } from '@/server/journal/service'
import { nextWish, streakCards } from '@/server/motivation/service'
import { StreakCard } from '@/components/streak-card'

/** "Thứ tư, 16/09" — Vietnam's calendar, wherever the server runs. */
function todayLabel() {
  const text = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date())
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Home is "Hôm nay": log today's meal, and the journal underneath. Recipes
 * live in the Sổ tab; this screen is about what actually got cooked.
 */
export default async function TodayPage() {
  const { user } = await requireUser()
  const [meals, counts, streaks, wish] = await Promise.all([
    listJournal(db, user.id, { limit: 20 }),
    mealCounts(db, user.id),
    streakCards(db, user.id),
    nextWish(db, user.id),
  ])
  const today = vnDate()

  return (
    <PageTransition>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-[18px] pt-6 pb-32">
        <header className="flex items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-muted">{todayLabel()}</span>
            <h1 className="font-display text-[32px] leading-tight font-extrabold">Hôm nay</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted">
              Tuần này <span className="font-mono text-ink">{counts.week}</span> bữa
            </span>
            <Link
              href="/settings" transitionTypes={['tab']}
              aria-label="Cài đặt"
              className="flex size-11 items-center justify-center rounded-full text-muted hover:bg-line-soft hover:text-ink"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </Link>
          </div>
        </header>

        {streaks.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {streaks.map((card) => (
              <StreakCard
                key={card.id}
                card={card}
                compact
                hint={
                  card.trigger === 'new_dish' && card.thisWeek < card.timesPerWeek && wish
                    ? `Gợi ý: ${wish.title} đang nằm trên bảng muốn chinh phục.`
                    : null
                }
              />
            ))}
          </div>
        ) : null}

        <Link
          href="/log" transitionTypes={['nav-forward']}
          className="flex items-center gap-3.5 rounded-[22px] border-2 border-ink bg-primary p-4 text-white shadow-pop"
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border-2 border-ink bg-surface text-ink">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="font-display text-[22px] leading-tight font-extrabold">
              {counts.today > 0 ? 'Ghi thêm bữa' : 'Ghi bữa hôm nay'}
            </span>
            <span className="text-[13px]">
              {counts.today > 0
                ? `Hôm nay đã ghi ${counts.today} bữa.`
                : 'Chụp ảnh, chọn món, tick đồ đã dùng từ tủ.'}
            </span>
          </span>
        </Link>

        <h2 className="font-display text-2xl font-extrabold">Nhật ký</h2>

        {meals.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-line px-5 py-8 text-center text-pretty text-muted">
            Chưa có bữa nào. Nấu xong chụp một tấm, ghi lại món gì — tủ lạnh tự cập nhật theo.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {meals.map((meal, i) => (
              <li key={meal.id}>
                <Link
                  href={`/journal/${meal.id}`} transitionTypes={['nav-forward']}
                  className="block overflow-hidden rounded-[18px] border border-line bg-surface hover:border-ink"
                >
                  {meal.photoPath ? (
                    <div className="relative h-[180px]">
                      <Image
                        src={photoUrl(meal.photoPath)}
                        alt={meal.title}
                        fill
                        unoptimized
                        loading={i === 0 ? 'eager' : 'lazy'}
                        sizes="448px"
                        className="object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-1.5 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        {meal.photoPath ? null : <Thumb id={meal.id} className="size-9 shrink-0 rounded-lg" />}
                        <span className="truncate font-semibold">{meal.title}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted">
                        {dayLabel(meal.cookedOn, today)}
                        {meal.cookedOn === today ? ` ${timeLabel(meal.createdAt)}` : ''}
                      </span>
                    </div>
                    {meal.note ? <span className="line-clamp-2 text-sm text-pretty text-muted">{meal.note}</span> : null}
                    {meal.usedCount > 0 ? (
                      <span className="self-start rounded-full bg-line-soft px-2.5 py-0.5 text-xs text-muted">
                        dùng {meal.usedCount} món trong tủ
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageTransition>
  )
}
