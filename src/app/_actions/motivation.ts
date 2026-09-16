'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/dal'
import { db } from '@/server/db'
import {
  createGoal,
  createStreak,
  createWish,
  deleteGoal,
  deleteStreak,
  deleteWish,
  goalInput,
  streakInput,
  toggleCheckin,
  updateStreak,
  wishInput,
} from '@/server/motivation/service'

export type FormState = { error?: string }

const id = z.uuid()

function refresh() {
  revalidatePath('/')
  revalidatePath('/achievements')
}

/** Empty strings from a form are "not given", not "". */
function field(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/* Streaks ------------------------------------------------------------------ */

function streakFromForm(form: FormData) {
  return streakInput.safeParse({
    name: field(form, 'name'),
    kind: field(form, 'kind'),
    restPerWeek: field(form, 'restPerWeek') ?? undefined,
    timesPerWeek: field(form, 'timesPerWeek') ?? undefined,
    trigger: field(form, 'trigger'),
    remindAt: form.get('remind') === 'on' ? field(form, 'remindAt') : null,
  })
}

export async function saveStreakAction(streakId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireUser()
  const parsed = streakFromForm(form)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Thiếu thông tin.' }

  if (streakId) {
    if (!id.safeParse(streakId).success || !(await updateStreak(db, user.id, streakId, parsed.data))) {
      return { error: 'Không tìm thấy streak này.' }
    }
  } else {
    await createStreak(db, user.id, parsed.data)
  }
  refresh()
  redirect('/achievements')
}

export async function deleteStreakAction(streakId: string) {
  const { user } = await requireUser()
  if (id.safeParse(streakId).success) await deleteStreak(db, user.id, streakId)
  refresh()
  redirect('/achievements')
}

export async function toggleCheckinAction(streakId: string) {
  const { user } = await requireUser()
  if (!id.safeParse(streakId).success) return
  await toggleCheckin(db, user.id, streakId)
  refresh()
}

/* Goals -------------------------------------------------------------------- */

export async function createGoalAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireUser()
  const parsed = goalInput.safeParse({
    title: field(form, 'title'),
    metric: field(form, 'metric'),
    tag: field(form, 'tag'),
    target: field(form, 'target'),
    startsOn: field(form, 'startsOn'),
    endsOn: field(form, 'endsOn'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Thiếu thông tin.' }

  await createGoal(db, user.id, parsed.data)
  refresh()
  redirect('/achievements')
}

export async function deleteGoalAction(goalId: string) {
  const { user } = await requireUser()
  if (id.safeParse(goalId).success) await deleteGoal(db, user.id, goalId)
  refresh()
}

/* Wishes ------------------------------------------------------------------- */

export async function createWishAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireUser()
  const parsed = wishInput.safeParse({
    title: field(form, 'title'),
    recipeId: field(form, 'recipeId'),
    sourceUrl: field(form, 'sourceUrl'),
    note: field(form, 'note'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Thiếu thông tin.' }

  try {
    await createWish(db, user.id, parsed.data)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Không lưu được.' }
  }
  refresh()
  redirect('/achievements')
}

export async function deleteWishAction(wishId: string) {
  const { user } = await requireUser()
  if (id.safeParse(wishId).success) await deleteWish(db, user.id, wishId)
  refresh()
}
