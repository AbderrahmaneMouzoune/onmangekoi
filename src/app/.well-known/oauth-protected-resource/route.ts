import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from 'mcp-handler'

import { authServerUrl } from '@/lib/mcp/auth'
import { mcpResourceUrl } from '@/lib/mcp/resource'

/**
 * Variante racine des métadonnées de ressource protégée, pour les clients MCP
 * qui ne tentent pas la forme suffixée. Même contenu : le seul serveur protégé
 * du site est `/api/mcp`.
 */
export function GET(request: Request): Response {
  return protectedResourceHandler({
    authServerUrls: [authServerUrl()],
    resourceUrl: mcpResourceUrl(),
  })(request)
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
