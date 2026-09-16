import { notFound } from 'next/navigation'
import { deleteStreakAction, saveStreakAction } from '@/app/_actions/motivation'
import { ConfirmForm } from '@/components/confirm-form'
import { PageTransition } from '@/components/page-transition'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import { getStreak } from '@/server/motivation/service'
import { StreakForm } from '../streak-form'

export default async function EditStreakPage({ params }: PageProps<'/streaks/[id]'>) {
  const { user } = await requireUser()
  const { id } = await params
  const streak = await getStreak(db, user.id, id)
  if (!streak) notFound()

  return (
    <PageTransition>
      <div className="pb-6">
        <StreakForm
          title="Sửa streak"
          submitLabel="Lưu"
          action={saveStreakAction.bind(null, streak.id)}
          initial={streak}
        />
        <div className="mx-auto -mt-6 w-full max-w-md px-[18px]">
          <ConfirmForm
            action={deleteStreakAction.bind(null, streak.id)}
            question={`Xoá streak “${streak.name}”? Lịch sử tick của nó cũng mất theo, nhật ký thì giữ nguyên.`}
            label="Xoá streak"
          />
        </div>
      </div>
    </PageTransition>
  )
}
