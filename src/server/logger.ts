/**
 * Structured logging.
 *
 * One JSON object per line on stdout, which is what Vercel's log drain, and
 * every other collector, can actually query. `console.log('failed', err)` is
 * unsearchable the moment there is more than one user.
 *
 * Deliberately dependency-free. A logging library is a thing to configure, and
 * the value here is the shape of the record, not the transport.
 *
 * No `next/*` imports.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

/** Anything attached to a log line. Keep keys stable — they get queried. */
export type LogContext = Record<string, unknown>

/**
 * Keys whose values must never reach a log line, matched case-insensitively
 * as substrings. Logs get shipped to third parties and read by people who
 * should not be looking at credentials.
 */
const REDACT = ['token', 'password', 'secret', 'authorization', 'cookie', 'apikey', 'api_key']

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]'
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT.some((r) => k.toLowerCase().includes(r)) ? '[redacted]' : scrub(v, depth + 1)
    }
    return out
  }
  return value
}

function emit(level: Level, message: string, context?: LogContext) {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(context ? (scrub(context) as LogContext) : {}),
  })

  // stderr for warn and error so platforms that split streams classify them
  // correctly without needing to parse the level.
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`)
  else process.stdout.write(`${line}\n`)
}

export const log = {
  debug: (message: string, context?: LogContext) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', message, context)
  },
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
}

/**
 * Times an operation and logs it if it is slow.
 *
 * Added because of a real incident: every home page query was fast alone and
 * the page hung forever when they ran together. Nothing logged, because
 * nothing failed. A slow-query line would have named the problem in seconds.
 */
export async function timed<T>(
  name: string,
  fn: () => Promise<T>,
  { warnAfterMs = 2000, context }: { warnAfterMs?: number; context?: LogContext } = {},
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    const ms = Date.now() - start
    if (ms >= warnAfterMs) log.warn('slow operation', { op: name, ms, ...context })
    return result
  } catch (error) {
    log.error('operation failed', { op: name, ms: Date.now() - start, error, ...context })
    throw error
  }
}
