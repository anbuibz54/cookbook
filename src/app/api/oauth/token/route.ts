import { db } from '@/server/db'
import { log } from '@/server/logger'
import { exchangeCode, OAuthError, refreshTokens } from '@/server/oauth/service'

export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

function error(code: string, description: string, status = 400) {
  return Response.json({ error: code, error_description: description }, { status, headers: NO_STORE })
}

/**
 * Token endpoint. `application/x-www-form-urlencoded` per RFC 6749 (Claude
 * sends form bodies); JSON is accepted too for convenience.
 */
export async function POST(request: Request) {
  const type = request.headers.get('content-type') ?? ''
  let params: URLSearchParams
  try {
    params = type.includes('application/json')
      ? new URLSearchParams(Object.entries((await request.json()) as Record<string, string>))
      : new URLSearchParams(await request.text())
  } catch {
    return error('invalid_request', 'Unreadable body.')
  }
  const get = (name: string) => params.get(name) ?? ''

  try {
    switch (get('grant_type')) {
      case 'authorization_code': {
        if (!get('code') || !get('client_id') || !get('redirect_uri') || !get('code_verifier')) {
          return error('invalid_request', 'code, client_id, redirect_uri and code_verifier are required.')
        }
        const tokens = await exchangeCode(db, {
          code: get('code'),
          clientId: get('client_id'),
          redirectUri: get('redirect_uri'),
          codeVerifier: get('code_verifier'),
        })
        return Response.json(tokens, { headers: NO_STORE })
      }
      case 'refresh_token': {
        if (!get('refresh_token') || !get('client_id')) {
          return error('invalid_request', 'refresh_token and client_id are required.')
        }
        const tokens = await refreshTokens(db, { refreshToken: get('refresh_token'), clientId: get('client_id') })
        return Response.json(tokens, { headers: NO_STORE })
      }
      default:
        return error('unsupported_grant_type', 'Use authorization_code or refresh_token.')
    }
  } catch (e) {
    if (e instanceof OAuthError) {
      log.warn('oauth token refused', { error: e.error, reason: e.message })
      return error(e.error, e.message, e.error === 'invalid_client' ? 401 : 400)
    }
    throw e
  }
}
