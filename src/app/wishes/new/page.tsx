import { PageTransition } from '@/components/page-transition'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import { recipeChoices } from '@/server/journal/service'
import { WishForm } from './wish-form'

export default async function NewWishPage() {
  const { user } = await requireUser()
  const recipes = await recipeChoices(db, user.id)
  return (
    <PageTransition>
      <WishForm recipes={recipes.map((r) => ({ id: r.id, title: r.title }))} />
    </PageTransition>
  )
}
