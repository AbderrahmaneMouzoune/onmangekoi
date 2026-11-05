import { describe, expect, it, vi } from 'vitest'

import { registerCatalogTools } from '@/lib/mcp/tools/catalog'
import { registerListTools } from '@/lib/mcp/tools/lists'
import { registerMeTools } from '@/lib/mcp/tools/me'
import { registerPrompts } from '@/lib/mcp/tools/prompts'
import { registerSessionTools } from '@/lib/mcp/tools/sessions'

import { MCP_PROMPTS, MCP_TOOL_GROUPS, listedMcpToolNames } from './content'
import { GET } from './route'

import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'

// Le marqueur `server-only` refuse d'être importé hors Server Component ; sous
// Vitest on le neutralise, comme le fait Next avec la condition `react-server`.
vi.mock('server-only', () => ({}))

/**
 * Relève les noms des tools que les modules `lib/mcp/tools/*` enregistrent,
 * sans démarrer de serveur : un faux `McpServer` qui note chaque
 * `registerTool` et ignore tout le reste (ressources, prompts…).
 */
type ToolHandler = (args: unknown, ctx: unknown) => Promise<CallToolResult>

interface RegisteredTool {
  name: string
  readOnly: boolean
  destructive: boolean
  handler: ToolHandler
}

function registered(): { tools: RegisteredTool[]; prompts: string[] } {
  const tools: RegisteredTool[] = []
  const prompts: string[] = []
  const handle = { enable() {}, disable() {}, remove() {}, update() {} }
  const server = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'registerTool') {
          return (
            name: string,
            config: { annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } },
            handler: ToolHandler
          ) => {
            tools.push({
              name,
              readOnly: config.annotations?.readOnlyHint === true,
              destructive: config.annotations?.destructiveHint === true,
              handler,
            })
            return handle
          }
        }
        if (property === 'registerPrompt') {
          return (name: string) => {
            prompts.push(name)
            return handle
          }
        }
        return () => undefined
      },
    }
  ) as McpServer
  registerCatalogTools(server)
  registerListTools(server)
  registerSessionTools(server)
  registerMeTools(server)
  registerPrompts(server)
  return { tools, prompts }
}

function registeredTools(): RegisteredTool[] {
  return registered().tools
}

describe('GET /llms.txt', () => {
  it('sert un markdown en texte brut, mis en cache', async () => {
    const response = GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('cache-control')).toContain('s-maxage=3600')

    const body = await response.text()
    // Convention llmstxt.org : un H1 avec le nom, puis un résumé en citation.
    expect(body.startsWith('# onmangekoi\n\n> ')).toBe(true)
    expect(body).toContain('## MCP')
  })

  it("annonce l'URL absolue du serveur MCP et ses métadonnées OAuth", async () => {
    const body = await GET().text()

    expect(body).toContain('https://onmangekoi.test/api/mcp')
    expect(body).toContain('https://onmangekoi.test/.well-known/oauth-protected-resource/api/mcp')
    expect(body).toContain('https://onmangekoi.test/oauth/consent')
    expect(body).toContain('(https://onmangekoi.test/join)')
  })

  it('décrit les deux connexions : OAuth recommandé, jeton personnel en repli', async () => {
    const body = await GET().text()

    expect(body).toContain('**Recommended: OAuth.**')
    expect(body).toContain('**Fallback: personal token.**')
    expect(body).toContain('`Authorization: Bearer omk_…`')
    expect(body).toContain('`?key=omk_…`')
    expect(body).toContain('https://onmangekoi.test/account')
    expect(body).toContain('`requires_oauth`')
  })

  it('annonce les prompts du serveur', async () => {
    const body = await GET().text()

    expect(body).toContain('### Prompts')
    for (const prompt of MCP_PROMPTS) expect(body).toContain(`- \`${prompt.name}\`: `)
  })

  it('liste chaque tool annoncé, avec son niveau de confirmation', async () => {
    const body = await GET().text()

    for (const name of listedMcpToolNames()) {
      expect(body).toContain(`- \`${name}\` (`)
    }
    expect(body).toContain('- `vote` (irreversible, ask the user first; OAuth only)')
    // Décider ou publier se modifie ensuite : pas « irreversible » pour le modèle.
    expect(body).toContain(
      '- `set_results_public` (affects the whole group, ask the user first; OAuth only)'
    )
    expect(body).toContain(
      '- `confirm_decision` (affects the whole group, ask the user first; OAuth only)'
    )
    // Ouverts aux deux connexions : pas de mention « OAuth only ».
    expect(body).toContain('- `search_restaurants` (read-only):')
    expect(body).toContain('- `remember_restaurant` (writes):')
  })
})

/**
 * Répartition attendue des tools entre les deux connexions. Le jeton personnel
 * ne passe que par les RPC `mcp_*` (catalogue et listes) ; tout le reste
 * demande le jeton OAuth, relayé à PostgREST.
 */
const SHARED_TOOLS = [
  'whoami',
  'search_restaurants',
  'find_restaurant',
  'search_google_places',
  'add_restaurant',
  'remember_restaurant',
  'my_lists',
  'get_list',
  'create_list',
  'add_to_list',
  'remove_from_list',
  'get_public_results',
]

const OAUTH_ONLY_TOOLS = [
  'suggest_restaurants',
  'get_shared_list',
  'my_sessions',
  'my_stats',
  'get_food_constraints',
  'set_food_constraints',
  'create_session',
  'start_session_from_list',
  'get_session',
  'join_session',
  'add_restaurants_to_session',
  'vote',
  'launch_session',
  'close_session',
  'get_results',
  'confirm_decision',
  'set_results_public',
]

describe('catalogue des tools de /llms.txt', () => {
  it('annonce exactement les tools du serveur, chacun avec sa connexion', () => {
    const access = new Map(
      MCP_TOOL_GROUPS.flatMap((group) => group.tools.map((tool) => [tool.name, tool.access]))
    )

    expect([...access.keys()].sort()).toEqual([...SHARED_TOOLS, ...OAUTH_ONLY_TOOLS].sort())
    for (const name of SHARED_TOOLS) expect([name, access.get(name)]).toEqual([name, 'any'])
    for (const name of OAUTH_ONLY_TOOLS) expect([name, access.get(name)]).toEqual([name, 'oauth'])
  })

  it('ne nomme chaque tool qu’une fois, en snake_case', () => {
    const names = listedMcpToolNames()

    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9_]*$/)
    for (const group of MCP_TOOL_GROUPS) expect(group.tools.length).toBeGreaterThan(0)
  })

  it('couvre tous les tools réellement enregistrés par le serveur MCP', () => {
    const listed = new Set(listedMcpToolNames())
    const missing = registeredTools()
      .map((tool) => tool.name)
      .filter((name) => !listed.has(name))

    expect(missing).toEqual([])
  })

  it('annonce exactement les prompts du serveur', () => {
    expect(MCP_PROMPTS.map((prompt) => prompt.name).sort()).toEqual(registered().prompts.sort())
  })

  it('refuse vraiment un jeton personnel sur chaque tool « OAuth only »', async () => {
    // Le refus `requires_oauth` tombe avant tout accès aux données : appeler
    // le tool ici ne touche ni Supabase ni le réseau. C'est ce qui garantit
    // qu'un jeton `omk_…` n'atteint ni les sessions, ni l'historique, ni le
    // profil — pas seulement ce que l'annonce en dit.
    const token = `omk_${'a'.repeat(48)}`
    const ctx = {
      http: {
        authInfo: {
          token,
          clientId: 'onmangekoi-personal-token',
          scopes: [],
          extra: { caller: { mode: 'token', token } },
        },
      },
    }
    const tools = new Map(registeredTools().map((tool) => [tool.name, tool]))

    for (const name of OAUTH_ONLY_TOOLS) {
      const tool = tools.get(name)
      expect([name, tool !== undefined]).toEqual([name, true])
      const result = await tool!.handler({}, ctx)
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect([name, result.isError, text.startsWith('requires_oauth:')]).toEqual([name, true, true])
    }
  })

  it('annonce le même niveau de risque que les annotations du tool', () => {
    const effects = new Map(
      MCP_TOOL_GROUPS.flatMap((group) => group.tools.map((tool) => [tool.name, tool.effect]))
    )

    // Lecture seule ⇔ « read-only » ; et un tool annoncé comme à faire
    // confirmer doit porter `destructiveHint`, sans quoi le client ne
    // demandera rien. L'inverse ne tient pas : retirer un resto de sa propre
    // liste est destructeur au sens MCP, mais n'engage personne d'autre.
    for (const tool of registeredTools()) {
      const effect = effects.get(tool.name)
      if (effect === undefined) continue
      expect([tool.name, effect === 'read']).toEqual([tool.name, tool.readOnly])
      if (effect === 'irreversible' || effect === 'confirm') {
        expect([tool.name, tool.destructive]).toEqual([tool.name, true])
      }
    }
  })
})
