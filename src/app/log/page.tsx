import { PageTransition } from '@/components/page-transition'
import { requireUser } from '@/lib/auth/dal'
import { vnDate } from '@/lib/dates'
import { formatAmount } from '@/lib/amount'
import { db } from '@/server/db'
import { recipeChoices } from '@/server/journal/service'
import { dishHistory, dishKeys, streakCards } from '@/server/motivation/service'
import { listProviders } from '@/server/ai/providers'
import { listPantry } from '@/server/pantry/service'
import { MealLogger } from './meal-logger'

/**
 * Log a meal. Reached from "Ghi bữa hôm nay" on the home screen, and from the
 * end of cook mode with `?recipe=<id>`, which starts with that dish picked.
 */
export default async function LogPage({ searchParams }: PageProps<'/log'>) {
  const { user } = await requireUser()
  const { recipe } = await searchParams

  const history = await dishHistory(db, user.id)
  const [recipes, pantry, streaks] = await Promise.all([
    recipeChoices(db, user.id),
    listPantry(db, user.id),
    streakCards(db, user.id, { history }),
  ])
  const provider = (await listProviders(db, user.id)).find((p) => p.active)
  // How often each dish identity was logged, for the "món mới" chip.
  const cooked: Record<string, number> = {}
  for (const dish of history) for (const key of dishKeys(dish)) cooked[key] = (cooked[key] ?? 0) + 1
  const today = vnDate()
  const start = typeof recipe === 'string' ? recipes.find((r) => r.id === recipe) : undefined

  return (
    <PageTransition>
      <MealLogger
        today={today}
        recipes={recipes}
        pantry={pantry
          .filter((p) => p.expiresOn == null || p.expiresOn >= today)
          .map((p) => ({ id: p.id, name: p.name, have: p.quantity != null ? formatAmount(p.quantity, p.unit) : '' }))}
        initialDish={start ? { recipeId: start.id, name: start.title } : null}
        backHref={start ? `/recipes/${start.id}` : '/'}
        cooked={cooked}
        ai={provider ? provider.label : null}
        streaks={streaks.map((s) => ({ id: s.id, name: s.name, trigger: s.trigger, doneToday: s.doneToday }))}
      />
    </PageTransition>
  )
}
