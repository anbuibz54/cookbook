/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * This file is Next-aware on purpose — it reaches for `next/headers`. That is
 * why it lives in `src/lib/`, not `src/server/`: the rule is that nothing in
 * the service layer imports from `next/*`, so the cookie plumbing stays here
 * and the service layer receives an already-resolved principal.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  // `cookies()` is async in this version of Next. It was synchronous in older
  // ones; most Supabase guides still show the old form.
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Components cannot set cookies. This throw is expected and
            // safe to swallow *only* because `proxy.ts` refreshes the session
            // on every request, so the rotated token is already persisted.
            // If the proxy is ever removed, sessions will start expiring
            // silently and this catch is why it looks fine.
          }
        },
      },
    },
  )
}
