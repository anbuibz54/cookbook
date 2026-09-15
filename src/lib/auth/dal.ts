import 'server-only'

/**
 * Data access layer for auth.
 *
 * This is the real authorization boundary — `proxy.ts` only does an optimistic
 * redirect and can be bypassed. Anything that touches user data goes through
 * `requireUser()` here.
 *
 * Every function is wrapped in React's `cache()`, which memoises per render
 * pass. That is what makes "provision on every authenticated request" cheap:
 * a page rendering five components that each need the user resolves it once.
 */

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { db } from '@/server/db'
import { provisionUser, type AppUser } from '@/server/auth/provision'
import { createClient } from '@/lib/supabase/server'

export type SessionUser = {
  /** The row in `cookbook.users`. */
  user: AppUser
}

/**
 * Resolve the caller, or null if signed out.
 *
 * Uses `getUser()` rather than `getSession()`: getSession trusts the cookie
 * without verifying it against the auth server, which makes it useless as an
 * authorization check.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser?.email) return null

  const user = await provisionUser(db, {
    id: authUser.id,
    email: authUser.email,
  })

  return { user }
})

/**
 * Resolve the caller or send them to /login.
 *
 * Use this in every page, Server Action, and route handler that reads or
 * writes user data — not the optimistic proxy check.
 */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const session = await getSessionUser()
  if (!session) redirect('/login')
  return session
})
