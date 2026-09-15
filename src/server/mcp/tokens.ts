/**
 * MCP bearer tokens.
 *
 * Only the hash is ever stored. The plaintext is returned once from
 * `createToken` and cannot be recovered — if it is lost, the fix is to make a
 * new one and revoke the old.
 *
 * No `next/*` imports.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db'
import { mcpTokens, users } from '../db/schema'

const PREFIX = 'cookbook_'

export type TokenRow = typeof mcpTokens.$inferSelect

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex')
}

/**
 * Mint a token. The plaintext is only ever in memory here and in the response
 * that shows it once.
 *
 * 32 random bytes, base64url. Long enough that guessing is not a threat model,
 * and the prefix makes it recognisable in a config file and greppable in a
 * leaked one.
 */
export async function createToken(
  db: Db,
  userId: string,
  name: string,
): Promise<{ token: string; row: TokenRow }> {
  const token = PREFIX + randomBytes(32).toString('base64url')

  const [row] = await db
    .insert(mcpTokens)
    .values({ userId, name: name.trim() || 'Unnamed', tokenHash: hashToken(token) })
    .returning()

  return { token, row }
}

export type Principal = { userId: string; email: string; tokenId: string }

/**
 * Resolve a bearer token to the user it belongs to.
 *
 * The lookup is by hash, which is a single unique-index hit — the comparison
 * is done by the index, not in application code, so there is no string compare
 * to get wrong. The `timingSafeEqual` below guards the one comparison we do
 * make, confirming the stored hash matches what we computed; it is belt and
 * braces over an already-constant-time lookup.
 *
 * Revoked tokens do not resolve. `lastUsedAt` is updated on success, which is
 * what makes an abandoned token visible later.
 */
export async function resolveToken(db: Db, plaintext: string): Promise<Principal | null> {
  if (!plaintext.startsWith(PREFIX)) return null

  const digest = hashToken(plaintext)

  const [found] = await db
    .select({
      tokenId: mcpTokens.id,
      tokenHash: mcpTokens.tokenHash,
      userId: users.id,
      email: users.email,
    })
    .from(mcpTokens)
    .innerJoin(users, eq(mcpTokens.userId, users.id))
    .where(and(eq(mcpTokens.tokenHash, digest), isNull(mcpTokens.revokedAt)))
    .limit(1)

  if (!found) return null

  const a = Buffer.from(found.tokenHash, 'hex')
  const b = Buffer.from(digest, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  // Fire-and-forget would be nicer, but a serverless function can be frozen
  // the moment the response is written, so an un-awaited write may never land.
  await db
    .update(mcpTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpTokens.id, found.tokenId))

  return { userId: found.userId, email: found.email, tokenId: found.tokenId }
}

export async function listTokens(db: Db, userId: string): Promise<TokenRow[]> {
  return db
    .select()
    .from(mcpTokens)
    .where(eq(mcpTokens.userId, userId))
    .orderBy(desc(mcpTokens.createdAt))
}

/** Soft delete, so a revoked token stays visibly revoked rather than vanishing. */
export async function revokeToken(db: Db, userId: string, tokenId: string): Promise<boolean> {
  const rows = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpTokens.id, tokenId), eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)))
    .returning({ id: mcpTokens.id })

  return rows.length > 0
}
