import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

/**
 * This database is SHARED with LifeOS (tables in `public`) and the bakery app
 * (schema `bakery`). Two settings keep the three from stepping on each other:
 *
 *  - `schemaFilter: ['cookbook']` — drizzle-kit only ever looks at, diffs, or
 *    drops things inside our own schema. Without it, `push` or `studio` would
 *    see LifeOS's tables as "not in the schema file".
 *
 *  - `migrations.schema/table` — drizzle-kit records applied migrations in
 *    `drizzle.__drizzle_migrations` by default, and LifeOS already uses that
 *    table. The migrator skips anything older than the newest row it finds, so
 *    sharing the table would silently skip migrations. Ours lives in
 *    `cookbook.__drizzle_migrations`.
 *
 * Migrations run against DIRECT_URL (session pooler, 5432). Only forward.
 */
export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['cookbook'],
  migrations: {
    schema: 'cookbook',
    table: '__drizzle_migrations',
  },
  dbCredentials: {
    url: process.env.DIRECT_URL ?? '',
  },
  strict: true,
  verbose: true,
})
