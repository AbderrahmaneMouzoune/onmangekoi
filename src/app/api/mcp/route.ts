import { withMcpAuth } from 'mcp-handler'

import { verifyMcpToken, withKeyParamAsBearer } from '@/lib/mcp/auth'
import { MCP_RESOURCE_METADATA_PATH, mcpResourceUrl } from '@/lib/mcp/resource'
import { mcpHandler } from '@/lib/mcp/server'

/**
 * Serveur MCP distant (Streamable HTTP, sans état) : `https://…/api/mcp`.
 *
 * Toute requête exige un jeton : OAuth Supabase, ou jeton personnel. Sans lui, la réponse est
 * un 401 dont l'en-tête `WWW-Authenticate` pointe vers les métadonnées de
 * ressource protégée : c'est ce qui déclenche, côté Claude, ChatGPT ou Cursor,
 * l'enregistrement du client puis le consentement sur `/oauth/consent`.
 */
const authenticated = withMcpAuth(mcpHandler, verifyMcpToken, {
  required: true,
  resourceUrl: new URL(mcpResourceUrl()).origin,
  resourceMetadataPath: MCP_RESOURCE_METADATA_PATH,
})

/**
 * Deux façons de se connecter (voir `src/lib/mcp/auth.ts`) : OAuth, ou un
 * jeton personnel `omk_…` — en en-tête, ou en `?key=` pour les clients qui ne
 * savent saisir qu'une URL.
 */
function handler(request: Request): Promise<Response> {
  return Promise.resolve(authenticated(withKeyParamAsBearer(request)))
}

export const maxDuration = 60

export { handler as GET, handler as POST, handler as DELETE }
