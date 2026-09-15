/**
 * Mint an MCP token from the command line.
 *
 *   pnpm mcp:token you@example.com "claude-code laptop"
 *
 * The same thing Settings → MCP does in the app, for when you want to connect
 * a client before signing in to the web UI. Looks the account up in Supabase
 * Auth (shared with LifeOS), provisions `cookbook.users`, prints the token once.
 */

import { createClient } from '@supabase/supabase-js'
import { db } from '../src/server/db/index.ts'
import { provisionUser } from '../src/server/auth/provision.ts'
import { createToken } from '../src/server/mcp/tokens.ts'

const [email, name = 'cli'] = process.argv.slice(2)
if (!email) {
  console.error('Usage: pnpm mcp:token <email> [token name]')
  process.exit(1)
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})

let authUser: { id: string; email?: string } | undefined
for (let page = 1; !authUser; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
  if (error) throw error
  authUser = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (data.users.length < 200) break
}

if (!authUser?.email) {
  console.error(`No Supabase Auth account with email ${email}. Sign up in LifeOS first.`)
  process.exit(1)
}

const user = await provisionUser(db, { id: authUser.id, email: authUser.email })
const { token } = await createToken(db, user.id, name)

console.log(`Token for ${user.email} (${name}) — shown once, store it now:\n\n${token}\n`)
process.exit(0)
