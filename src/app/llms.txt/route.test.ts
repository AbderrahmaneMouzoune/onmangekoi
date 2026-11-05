import { describe, expect, it, vi } from 'vitest'

import { registerCatalogTools } from '@/lib/mcp/tools/catalog'
import { registerListTools } from '@/lib/mcp/tools/lists'
import { registerMeTools } from '@/lib/mcp/tools/me'
import { registerSessionTools } from '@/lib/mcp/tools/sessions'

import { MCP_TOOL_GROUPS, listedMcpToolNames } from './content'
import { GET } from './route'

import type { McpServer } from '@modelcontextprotocol/server'

// Le marqueur `server-only` refuse d'être importé hors Server Component ; sous
// Vitest on le neutralise, comme le fait Next avec la condition `react-server`.
vi.mock('server-only', () => ({}))

/**
 * Relève les noms des tools que les modules `lib/mcp/tools/*` enregistrent,
 * sans démarrer de serveur : un faux `McpServer` qui note chaque
 * `registerTool` et ignore tout le reste (ressources, prompts…).
 */
interface RegisteredTool {
  name: string
  readOnly: boolean
  destructive: boolean
}

function registeredTools(): RegisteredTool[] {
  const tools: RegisteredTool[] = []
  const server = new Proxy(
    {},
    {
      get: (_target, property) =>
        property === 'registerTool'
          ? (
              name: string,
              config: { annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }
            ) => {
              tools.push({
                name,
                readOnly: config.annotations?.readOnlyHint === true,
                destructive: config.annotations?.destructiveHint === true,
              })
              return { enable() {}, disable() {}, remove() {}, update() {} }
            }
          : () => undefined,
    }
  ) as McpServer
  registerCatalogTools(server)
  registerListTools(server)
  registerSessionTools(server)
  registerMeTools(server)
  return tools
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

  it('liste chaque tool annoncé, avec son niveau de confirmation', async () => {
    const body = await GET().text()

    for (const name of listedMcpToolNames()) {
      expect(body).toContain(`- \`${name}\` (`)
    }
    expect(body).toContain('- `vote` (irreversible, ask the user first)')
    // Décider ou publier se modifie ensuite : pas « irreversible » pour le modèle.
    expect(body).toContain('- `set_results_public` (affects the whole group, ask the user first)')
    expect(body).toContain('- `confirm_decision` (affects the whole group, ask the user first)')
    expect(body).toContain('- `search_restaurants` (read-only)')
  })
})

describe('catalogue des tools de /llms.txt', () => {
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
