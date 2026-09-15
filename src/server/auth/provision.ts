/**
 * User provisioning.
 *
 * `cookbook.users` mirrors the auth provider's user (the same Supabase Auth
 * users LifeOS signs in with). The row is created here, on
 * first authenticated request, rather than by a database trigger on
 * `auth.users`.
 *
 * Why not a trigger: it would have to live in the `auth` schema, which Supabase
 * owns. That puts it outside our migrations (it needs elevated grants), so it
 * would be applied by hand in a dashboard — invisible to the repo, missing from
 * a fresh clone, and gone entirely the day we leave Supabase. This function is
 * ordinary application code that runs on any Postgres.
 *
 * ---
 * PORTABILITY SEAM. `AuthPrincipal.id` is currently a Supabase Auth UUID, and
 * it is what every `user_id` foreign key points at. Moving to another auth
 * provider means either preserving those UUIDs or remapping them, and this
 * function is the one place that knows the mapping. If a second provider is
 * ever needed at the same time, the shape to add is (provider, subject) columns
 * with a surrogate `users.id` — not a second copy of this logic elsewhere.
 * ---
 *
 * No `next/*` imports. This file does not know what is serving it.
 */

import { eq } from 'drizzle-orm'
import type { Db } from '../db'
import { users } from '../db/schema'

/** Whoever the auth layer says is making this request. Provider-agnostic. */
export type AuthPrincipal = {
  id: string
  email: string
}

export type AppUser = typeof users.$inferSelect

/**
 * Ensure a `users` row exists for this principal and return it.
 *
 * Idempotent: on the overwhelmingly common path this is a single primary-key
 * lookup that finds the row and writes nothing. `onConflictDoUpdate` on the
 * email keeps the mirror correct if the address changes at the provider, which
 * `doNothing` would silently let drift.
 *
 * Callers should memoise this per request rather than calling it per query.
 */
export async function provisionUser(db: Db, principal: AuthPrincipal): Promise<AppUser> {
  const [row] = await db
    .insert(users)
    .values({ id: principal.id, email: principal.email })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: principal.email },
    })
    .returning()

  return row
}

/** Read-only lookup, for paths that must not create anything. */
export async function findUserById(db: Db, id: string): Promise<AppUser | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return row
}
