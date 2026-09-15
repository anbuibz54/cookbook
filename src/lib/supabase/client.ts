/**
 * Supabase client for the browser.
 *
 * Only ever holds the publishable key, which is safe to ship — RLS still
 * applies to it. The secret key must never reach this file.
 *
 * Note this client is used for *authentication only*. Application data goes
 * through the service layer, never straight from the browser to Supabase:
 * two authorization models is how holes appear.
 */

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
