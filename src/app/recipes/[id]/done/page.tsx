import { redirect } from 'next/navigation'

/**
 * The old "nấu xong" screen. Deducting from the pantry now happens when the
 * meal is logged (/log), which asks the same question with editable amounts
 * and keeps a record; this route stays so an open cook-mode tab still lands
 * somewhere sensible.
 */
export default async function CookedPage({ params }: PageProps<'/recipes/[id]/done'>) {
  const { id } = await params
  redirect(`/log?recipe=${encodeURIComponent(id)}`)
}
