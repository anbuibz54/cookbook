import { MCP_PATH, publicOrigin } from '@/lib/origin'
import { SCOPE } from '@/server/oauth/service'

/**
 * RFC 9728 protected resource metadata for the MCP endpoint. Served at both
 * /.well-known/oauth-protected-resource and …/api/mcp: the 401 from /api/mcp
 * points at the second, and clients that probe fall back to the first.
 */
export function GET(request: Request) {
  const origin = publicOrigin(request)
  return Response.json(
    {
      resource: `${origin}${MCP_PATH}`,
      authorization_servers: [origin],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ['header'],
      resource_name: 'Sổ công thức',
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  )
}
