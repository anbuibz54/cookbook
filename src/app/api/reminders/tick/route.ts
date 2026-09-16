import { timingSafeEqual } from 'node:crypto'
import { db } from '@/server/db'
import { runReminders } from '@/server/push/reminders'

/**
 * Called every 15 minutes by Supabase pg_cron through pg_net (see
 * scripts/reminders-cron.mts), with `Authorization: Bearer <CRON_SECRET>`.
 * Idempotent, so a retry or a manual call is harmless.
 */
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') ?? ''
  if (!secret || !header.startsWith('Bearer ')) return false
  const given = Buffer.from(header.slice(7))
  const expected = Buffer.from(secret)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function POST(request: Request) {
  if (!authorized(request)) return new Response('Unauthorized', { status: 401 })
  const report = await runReminders(db)
  return Response.json(report)
}
