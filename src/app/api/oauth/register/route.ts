import { db } from '@/server/db'
import { log } from '@/server/logger'
import { registerClient, registrationInput } from '@/server/oauth/service'

export const runtime = 'nodejs'

/** Dynamic Client Registration (RFC 7591). Claude calls this the first time it connects. */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_client_metadata', error_description: 'Body must be JSON.' }, { status: 400 })
  }
  const parsed = registrationInput.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_redirect_uri', error_description: parsed.error.issues[0]?.message ?? 'Invalid metadata.' },
      { status: 400 },
    )
  }
  if (parsed.data.token_endpoint_auth_method && parsed.data.token_endpoint_auth_method !== 'none') {
    return Response.json(
      { error: 'invalid_client_metadata', error_description: 'Only public clients (token_endpoint_auth_method "none") are supported.' },
      { status: 400 },
    )
  }

  const client = await registerClient(db, parsed.data)
  log.info('oauth client registered', { clientId: client.clientId, name: client.name })
  return Response.json(
    {
      client_id: client.clientId,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  )
}
