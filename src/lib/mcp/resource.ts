import 'server-only'

import { absoluteUrl } from '@/lib/site'

/** Chemin du serveur MCP. */
export const MCP_PATH = '/api/mcp'

/**
 * Métadonnées de ressource protégée (RFC 9728), sous la forme suffixée par le
 * chemin du serveur : c'est la première que les clients MCP essaient.
 */
export const MCP_RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`

/**
 * Identifiant de la ressource : l'URL exacte du serveur MCP, chemin compris.
 * Claude refuse une valeur qui ne serait pas l'URL saisie par l'utilisateur.
 */
export function mcpResourceUrl(): string {
  return absoluteUrl(MCP_PATH)
}
