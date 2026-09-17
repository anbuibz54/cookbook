import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { db } from '@/server/db'
import { buildMcpServer } from '@/server/mcp/server'
import { resolveToken } from '@/server/mcp/tokens'
import { log } from '@/server/logger'
import { publicOrigin, resourceMetadataUrl } from '@/lib/origin'

/**
 * The MCP endpoint.
 *
 * **Stateless, by necessity.** Serverless functions are ephemeral: any session
 * map would live in one invocation's memory and be gone from the next, and a
 * long-lived SSE stream would be cut off by the execution timeout. So no
 * `sessionIdGenerator` (which is what puts the transport in stateless mode),
 * `enableJsonResponse` so a plain JSON body comes back instead of a stream,
 * and a fresh server per request.
 *
 * The per-request construction is the point, not a cost: the server closes
 * over the authenticated principal, so every tool is scoped to one user's rows
 * by construction rather than by remembering to filter.
 *
 * The Web-standard transport takes a `Request` and returns a `Response`, which
 * is what a route handler already has. The Node transport of the same name
 * wants `IncomingMessage`/`ServerResponse` and does not fit here.
 */

// Node runtime: the token service uses `node:crypto`, and Drizzle talks to
// Postgres over TCP. Neither works on the edge runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function unauthorized(request: Request, detail: string) {
  return Response.json(
    {
      jsonrpc: '2.0',
      error: { code: -32001, message: detail },
      id: null,
    },
    {
      status: 401,
      // Tells a client how to authenticate rather than leaving it to guess.
      // `resource_metadata` is what lets Claude (phone, claude.ai) discover the
      // OAuth flow; without it the connector fails with "Couldn't reach the MCP
      // server". Bearer tokens from Settings keep working as before.
      headers: {
        'WWW-Authenticate': `Bearer realm="cookbook", resource_metadata="${resourceMetadataUrl(publicOrigin(request))}"`,
      },
    },
  )
}

async function handle(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    log.warn('mcp auth missing', { path: new URL(request.url).pathname })
    return unauthorized(request, 'Missing bearer token.')
  }

  const principal = await resolveToken(db, auth.slice('Bearer '.length).trim())
  if (!principal) {
    // Same message for absent, malformed, unknown, and revoked. Which one it
    // was is not information an unauthenticated caller has earned — but it is
    // worth logging, since a run of these is what a probe looks like.
    log.warn('mcp auth rejected', { path: new URL(request.url).pathname })
    return unauthorized(request, 'Invalid, expired or revoked token.')
  }

  const url = new URL(request.url)
  const baseUrl = `${url.protocol}//${url.host}`

  const server = buildMcpServer(db, principal, baseUrl)
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Absent on purpose — this is what selects stateless mode.
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  await server.connect(transport)

  try {
    return await transport.handleRequest(request)
  } finally {
    // The invocation may be frozen the moment the response is written, so the
    // transport is torn down explicitly rather than left to a listener that
    // might never run.
    await transport.close().catch(() => {})
  }
}

export const POST = handle

/**
 * GET would open the standalone SSE stream, which stateless mode cannot serve.
 * Answering plainly is friendlier than letting the transport fail obscurely.
 */
export async function GET() {
  return Response.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'This server is stateless. Use POST; server-initiated streams are not supported.',
      },
      id: null,
    },
    { status: 405, headers: { Allow: 'POST' } },
  )
}
