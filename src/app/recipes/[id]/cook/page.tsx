import { notFound, redirect } from 'next/navigation'
import { PageTransition } from '@/components/page-transition'
import { requireUser } from '@/lib/auth/dal'
import { mentionedIn } from '@/lib/cook'
import { formatQuantity } from '@/lib/units'
import { db } from '@/server/db'
import { getRecipe } from '@/server/recipes/service'
import { CookMode, type CookStep } from './cook-mode'

export default async function CookPage({ params }: PageProps<'/recipes/[id]/cook'>) {
  const { user } = await requireUser()
  const { id } = await params
  const full = await getRecipe(db, user.id, id)
  if (!full) notFound()
  // Nothing to walk through; the recipe page is the better place to be.
  if (full.steps.length === 0) redirect(`/recipes/${id}`)

  const ingredients = full.ingredients.map((line) => ({
    id: line.id,
    name: line.name,
    amount:
      line.quantity == null
        ? null
        : `${formatQuantity(line.quantity)}${
            line.quantityMax != null ? `–${formatQuantity(line.quantityMax)}` : ''
          }${line.unit ? ` ${line.unit}` : ''}`,
  }))

  const steps: CookStep[] = full.steps.map((step) => ({
    id: step.id,
    body: step.body,
    section: step.section,
    timerSeconds: step.timerSeconds,
    ingredients: mentionedIn(step.body, ingredients).slice(0, 5),
  }))

  return (
    <PageTransition>
      <CookMode recipeId={full.recipe.id} title={full.recipe.title} steps={steps} />
    </PageTransition>
  )
}
