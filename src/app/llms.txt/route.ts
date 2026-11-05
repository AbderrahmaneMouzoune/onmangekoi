import { env } from '@/env'
import { mcpEndpoint } from '@/lib/mcp'

/**
 * `/llms.txt` — l'app présentée aux IA (https://llmstxt.org) : ce qu'elle
 * fait, et comment s'y brancher par MCP. Une IA à qui l'on donne l'adresse
 * du site y trouve de quoi guider la personne jusqu'au jeton.
 */
export function GET(): Response {
  const endpoint = mcpEndpoint(env.SITE_URL)
  const body = `# onmangekoi

> Lists of restaurants you love, to share with friends — and a quick vote to decide where to eat together.

People keep lists of the restaurants they like ("Lunch near the office", "Brunchs"…), share them by link, and start a vote session from a list: everyone swipes, the app ranks, the group goes.

## Connect an AI (MCP)

- Endpoint (Streamable HTTP): ${endpoint}
- Auth: a personal token created in the app (Account → "Connect your AI"), sent as \`Authorization: Bearer omk_…\`, or appended as \`?key=omk_…\` for clients that only accept a URL.
- Main tool: \`remember_restaurant\` — "I ate at La Ba, it was great": finds the restaurant in the app's catalog (or on Google), adds it if missing, files it in the right list, never twice.
- Other tools: \`find_restaurant\`, \`search_google_places\`, \`add_restaurant\`, \`my_lists\`, \`get_list\`, \`create_list\`, \`add_to_list\`, \`remove_from_list\`, \`whoami\`.

## Links

- App: ${env.SITE_URL}
- Account (create a token): ${new URL('/account', env.SITE_URL).toString()}
`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
