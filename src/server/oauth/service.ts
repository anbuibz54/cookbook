/**
 * OAuth 2.1 for the MCP endpoint, so Claude on the phone and on claude.ai can
 * connect: those apps only speak OAuth (a static bearer header is for
 * organisation admins), while Claude Code keeps using tokens from Settings.
 *
 * What Claude needs, and all this implements:
 *  - Dynamic Client Registration (RFC 7591), public clients only.
 *  - Authorization code with PKCE S256 — mandatory, no plain.
 *  - Refresh tokens, rotated on every use (OAuth 2.1 for public clients).
 *
 * Tokens are the existing `mcp_tokens` rows: an OAuth connection is one row
 * whose access + refresh hashes rotate in place, so Settings lists it and can
 * revoke it like any other token. Only hashes are stored.
 *
 * No `next/*` imports.
 */

import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db'
import { mcpTokens, oauthClients, oauthCodes } from '../db/schema'

export const SCOPE = 'cookbook'
const ACCESS_TTL_S = 60 * 60
const REFRESH_TTL_S = 90 * 24 * 60 * 60
const CODE_TTL_S = 5 * 60

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const random = (bytes: number) => randomBytes(bytes).toString('base64url')

export type OAuthClient = typeof oauthClients.$inferSelect

/* -------------------------------------------------------------- registration */

function isLoopback(url: URL) {
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

export const registrationInput = z.object({
  redirect_uris: z
    .array(z.string().max(500))
    .min(1)
    .max(10)
    .refine(
      (uris) =>
        uris.every((u) => {
          try {
            const url = new URL(u)
            return (url.protocol === 'https:' || isLoopback(url)) && !url.hash
          } catch {
            return false
          }
        }),
      'redirect_uris must be https (or http loopback) URLs without a fragment.',
    ),
  client_name: z.string().trim().max(100).optional(),
  token_endpoint_auth_method: z.string().optional(),
})

export async function registerClient(db: Db, input: z.output<typeof registrationInput>): Promise<OAuthClient> {
  const [row] = await db
    .insert(oauthClients)
    .values({
      clientId: `cbk_${random(18)}`,
      name: input.client_name || 'Ứng dụng AI',
      redirectUris: input.redirect_uris,
    })
    .returning()
  return row
}

export async function getClient(db: Db, clientId: string): Promise<OAuthClient | null> {
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId))
  return row ?? null
}

/**
 * Exact match against a registered URI; for loopback redirects (native apps,
 * Claude Code) the port may differ, per RFC 8252 §7.3.
 */
export function redirectAllowed(client: OAuthClient, redirectUri: string): boolean {
  if (client.redirectUris.includes(redirectUri)) return true
  let wanted: URL
  try {
    wanted = new URL(redirectUri)
  } catch {
    return false
  }
  if (!isLoopback(wanted)) return false
  return client.redirectUris.some((registered) => {
    try {
      const url = new URL(registered)
      return isLoopback(url) && url.hostname === wanted.hostname && url.pathname === wanted.pathname
    } catch {
      return false
    }
  })
}

/* ------------------------------------------------------------- authorization */

export async function createCode(
  db: Db,
  input: { clientId: string; userId: string; redirectUri: string; codeChallenge: string },
): Promise<string> {
  const code = random(32)
  await db.insert(oauthCodes).values({
    codeHash: sha256(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    expiresAt: new Date(Date.now() + CODE_TTL_S * 1000),
  })
  return code
}

/* --------------------------------------------------------------------- token */

export type TokenResponse = {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}

export class OAuthError extends Error {
  constructor(
    readonly error: 'invalid_request' | 'invalid_grant' | 'invalid_client' | 'unsupported_grant_type',
    description: string,
  ) {
    super(description)
  }
}

function newPair() {
  const access = `cookbook_${random(32)}`
  const refresh = `cookbookr_${random(32)}`
  const now = Date.now()
  return {
    access,
    refresh,
    columns: {
      tokenHash: sha256(access),
      refreshHash: sha256(refresh),
      expiresAt: new Date(now + ACCESS_TTL_S * 1000),
      refreshExpiresAt: new Date(now + REFRESH_TTL_S * 1000),
    },
  }
}

function response(pair: ReturnType<typeof newPair>): TokenResponse {
  return {
    access_token: pair.access,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_S,
    refresh_token: pair.refresh,
    scope: SCOPE,
  }
}

function pkceMatches(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false
  return createHash('sha256').update(verifier).digest('base64url') === challenge
}

export async function exchangeCode(
  db: Db,
  input: { code: string; clientId: string; redirectUri: string; codeVerifier: string },
): Promise<TokenResponse> {
  const client = await getClient(db, input.clientId)
  if (!client) throw new OAuthError('invalid_client', 'Unknown client.')

  // Claim the code first: a second use of the same code must fail.
  const [code] = await db
    .update(oauthCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(oauthCodes.codeHash, sha256(input.code)),
        isNull(oauthCodes.usedAt),
        gt(oauthCodes.expiresAt, new Date()),
      ),
    )
    .returning()
  if (!code) throw new OAuthError('invalid_grant', 'Code is invalid, expired or already used.')
  if (code.clientId !== client.clientId) throw new OAuthError('invalid_grant', 'Code was issued to another client.')
  if (code.redirectUri !== input.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri does not match.')
  if (!pkceMatches(input.codeVerifier, code.codeChallenge)) throw new OAuthError('invalid_grant', 'PKCE verification failed.')

  const pair = newPair()
  await db.insert(mcpTokens).values({
    userId: code.userId,
    name: `${client.name} (kết nối OAuth)`,
    clientId: client.clientId,
    ...pair.columns,
  })
  return response(pair)
}

export async function refreshTokens(
  db: Db,
  input: { refreshToken: string; clientId: string },
): Promise<TokenResponse> {
  const pair = newPair()
  // Rotate in place: the old refresh token stops working in the same write.
  const [row] = await db
    .update(mcpTokens)
    .set(pair.columns)
    .where(
      and(
        eq(mcpTokens.refreshHash, sha256(input.refreshToken)),
        eq(mcpTokens.clientId, input.clientId),
        isNull(mcpTokens.revokedAt),
        gt(mcpTokens.refreshExpiresAt, new Date()),
      ),
    )
    .returning({ id: mcpTokens.id })
  if (!row) throw new OAuthError('invalid_grant', 'Refresh token is invalid, expired or revoked.')
  return response(pair)
}
