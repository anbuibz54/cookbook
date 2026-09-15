/**
 * Database client. Same setup as LifeOS, whose database this shares.
 *
 * Session pooler (5432), `prepare: false`. Transaction mode (6543) hangs with
 * postgres.js under query depth — measurements in
 * LifeOS `src/server/db/index.ts`.
 *
 * `max: 3`, lower than LifeOS's 5: the session pooler holds one backend per
 * client connection, and three apps now share the project's pooler limit. No
 * cookbook page fans out more than three queries at once; raise this if one
 * starts to.
 *
 * No `next/*` imports.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env.local and fill in the ' +
      'Supabase session pooler connection string.',
  )
}

function createClient() {
  return postgres(connectionString!, { prepare: false, max: 3 })
}

/** Reuse the pool across hot reloads in dev, or the connection limit goes in a minute. */
const globalForDb = globalThis as unknown as {
  __cookbookDbClient?: ReturnType<typeof createClient>
}

const client = globalForDb.__cookbookDbClient ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__cookbookDbClient = client
}

export const db = drizzle(client, { schema })

export { schema }
export type Db = typeof db
