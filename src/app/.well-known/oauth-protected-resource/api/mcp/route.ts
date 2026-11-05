import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from 'mcp-handler'

import { authServerUrl } from '@/lib/mcp/auth'
import { mcpResourceUrl } from '@/lib/mcp/resource'

/**
 * Métadonnées de ressource protégée (RFC 9728) du serveur MCP : elles disent
 * au client que `/api/mcp` s'autorise auprès du serveur OAuth de Supabase.
 * Voir aussi la variante sans suffixe, `/.well-known/oauth-protected-resource`.
 */
export function GET(request: Request): Response {
  return protectedResourceHandler({
    authServerUrls: [authServerUrl()],
    resourceUrl: mcpResourceUrl(),
  })(request)
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
