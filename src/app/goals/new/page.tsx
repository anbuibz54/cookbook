import { PageTransition } from '@/components/page-transition'
import { requireUser } from '@/lib/auth/dal'
import { vnDate } from '@/lib/dates'
import { db } from '@/server/db'
import { tagCounts } from '@/server/recipes/service'
import { GoalForm } from './goal-form'

export default async function NewGoalPage() {
  const { user } = await requireUser()
  const today = vnDate()
  const [y, m] = today.split('-').map(Number)
  // Last day of this month: day 0 of the next one.
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const tags = (await tagCounts(db, user.id)).map((t) => t.tag)

  return (
    <PageTransition>
      <GoalForm today={today} monthEnd={monthEnd} month={m} tags={tags} />
    </PageTransition>
  )
}
