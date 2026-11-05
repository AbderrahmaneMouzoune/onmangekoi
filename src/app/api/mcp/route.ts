import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import { isLocale, negotiateLocale, type Locale } from '@/i18n/config'
import { tokenFromRequest } from '@/lib/mcp'
import { createMcpServer } from '@/mcp/server'

/**
 * `/api/mcp` — serveur MCP d'onmangekoi (Streamable HTTP, sans état).
 *
 * Une IA s'y branche avec un jeton personnel créé depuis la page compte :
 * en-tête `Authorization: Bearer omk_…`, ou `?key=omk_…` pour les clients
 * qui ne savent qu'une URL. Le jeton n'est pas vérifié ici : chaque outil le
 * passe à une RPC `mcp_*`, qui le résout en base — un jeton faux ou révoqué
 * y est refusé, avec un message lisible par l'IA.
 *
 * Sans jeton du tout, 401 : le client sait qu'il lui manque une clé avant
 * même d'initialiser la session.
 *
 * Langue des messages : `?lang=en`, sinon `Accept-Language`, sinon français.
 */

function localeOf(request: Request): Locale {
  const explicit = new URL(request.url).searchParams.get('lang')
  if (isLocale(explicit)) return explicit
  return negotiateLocale(request.headers.get('accept-language'))
}

function unauthorized(): Response {
  return Response.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message:
          'Missing onmangekoi token. Create one in your account (Connect your AI) and send it as "Authorization: Bearer <token>" or "?key=<token>".',
      },
      id: null,
    },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="onmangekoi"' } }
  )
}

async function handle(request: Request): Promise<Response> {
  const token = tokenFromRequest(request)
  if (!token) return unauthorized()

  const server = createMcpServer({ token, locale: localeOf(request) })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}

export { handle as GET, handle as POST, handle as DELETE }
