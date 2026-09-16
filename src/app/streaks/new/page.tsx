import { saveStreakAction } from '@/app/_actions/motivation'
import { PageTransition } from '@/components/page-transition'
import { requireUser } from '@/lib/auth/dal'
import { STREAK_PRESETS } from '@/server/motivation/service'
import { StreakForm } from '../streak-form'

/** New streak. `?preset=com-nha|nhat-ky|mon-moi` starts from a ready-made one. */
export default async function NewStreakPage({ searchParams }: PageProps<'/streaks/new'>) {
  await requireUser()
  const { preset } = await searchParams
  const start = typeof preset === 'string' ? STREAK_PRESETS[preset] : undefined

  return (
    <PageTransition>
      <StreakForm
        title="Streak mới"
        submitLabel="Tạo streak"
        action={saveStreakAction.bind(null, null)}
        initial={
          start
            ? { ...start, remindAt: start.remindAt ?? null }
            : { name: '', kind: 'daily', restPerWeek: 1, timesPerWeek: 1, trigger: 'tick', remindAt: null }
        }
      />
    </PageTransition>
  )
}
