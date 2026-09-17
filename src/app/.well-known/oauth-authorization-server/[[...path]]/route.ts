import { publicOrigin } from '@/lib/origin'
import { SCOPE } from '@/server/oauth/service'

/** RFC 8414 authorization server metadata. The app is its own authorization server. */
export function GET(request: Request) {
  const origin = publicOrigin(request)
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [SCOPE],
      service_documentation: `${origin}/settings`,
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  )
}
