/**
 * The public origin of a request ("https://cookbook-five-chi.vercel.app"),
 * honouring the proxy headers Vercel sets. OAuth metadata must name exactly
 * the URL the client used, or discovery fails.
 */
export function publicOrigin(request: Request): string {
  const url = new URL(request.url)
  const host = request.headers.get('x-forwarded-host') ?? url.host
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  return `${proto}://${host}`
}

export const MCP_PATH = '/api/mcp'

export function resourceMetadataUrl(origin: string) {
  return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`
}
