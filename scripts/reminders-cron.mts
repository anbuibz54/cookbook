/**
 * Schedule the reminder run in Supabase: every 15 minutes, pg_cron asks pg_net
 * to POST /api/reminders/tick with the CRON_SECRET from Supabase Vault.
 *
 *   pnpm reminders:cron [baseUrl] [--enable-extensions]
 *
 * baseUrl defaults to APP_URL, else the production URL. Idempotent: re-running
 * updates the secret and the job in place.
 *
 * The database is SHARED with LifeOS. This touches only: the pg_cron / pg_net
 * extensions (created only with --enable-extensions), one Vault secret named
 * `cookbook_cron_secret`, and one cron job named `cookbook-reminders`. It
 * never lists, changes or removes anything else in `cron` or `vault`.
 *
 * Why not Vercel Cron: the Hobby plan runs crons once a day, and reminders
 * have per-streak times.
 */

import postgres from 'postgres'

const args = process.argv.slice(2)
const enable = args.includes('--enable-extensions')
const base = (args.find((a) => !a.startsWith('--')) ?? process.env.APP_URL ?? 'https://cookbook-five-chi.vercel.app').replace(/\/+$/, '')
const url = `${base}/api/reminders/tick`
const secret = process.env.CRON_SECRET
if (!secret) throw new Error('Set CRON_SECRET in .env.local (and the same value on Vercel).')

const sql = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1 })

const installed = new Set(
  (await sql`select extname from pg_extension where extname in ('pg_cron', 'pg_net')`).map((r) => r.extname as string),
)
for (const ext of ['pg_cron', 'pg_net']) {
  if (installed.has(ext)) continue
  if (!enable) {
    console.error(`${ext} is not enabled in this project. Enable it (Dashboard → Database → Extensions) or re-run with --enable-extensions.`)
    process.exit(1)
  }
  if (ext === 'pg_cron') await sql`create extension if not exists pg_cron`
  else await sql`create extension if not exists pg_net with schema extensions`
  console.log(`enabled ${ext}`)
}

const [existing] = await sql`select id from vault.secrets where name = 'cookbook_cron_secret'`
if (existing) await sql`select vault.update_secret(${existing.id}, ${secret})`
else await sql`select vault.create_secret(${secret}, 'cookbook_cron_secret', 'Bearer secret for cookbook /api/reminders/tick')`
console.log(`vault secret cookbook_cron_secret ${existing ? 'updated' : 'created'}`)

// The job body reads the secret from Vault at run time, so it never sits in cron.job in plain text.
const command = `
  select net.http_post(
    url := '${url.replace(/'/g, "''")}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cookbook_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
`
const [job] = await sql`select cron.schedule('cookbook-reminders', '*/15 * * * *', ${command}) as id`
console.log(`cron job cookbook-reminders (id ${job.id}) → every 15 min → POST ${url}`)
await sql.end()
