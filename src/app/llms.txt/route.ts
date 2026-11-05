import { buildLlmsTxt } from './content'

/**
 * `/llms.txt` : la porte d'entrée des agents (convention llmstxt.org) — ce
 * qu'est onmangekoi, ses concepts, ses pages publiques et son serveur MCP.
 *
 * Rien n'y dépend de la requête : la route est prérendue au build (Cache
 * Components) et la réponse se met en cache comme le flux RSS. Le proxy ne la
 * voit pas (son matcher exclut les `.txt`), elle n'est donc pas réécrite sous
 * un segment de langue.
 */
export function GET(): Response {
  return new Response(buildLlmsTxt(), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
