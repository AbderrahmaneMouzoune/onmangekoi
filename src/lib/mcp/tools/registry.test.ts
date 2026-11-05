import { McpServer } from '@modelcontextprotocol/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthInfo, CallToolResult } from '@modelcontextprotocol/server'

vi.mock('server-only', () => ({}))

/**
 * Le serveur MCP tel qu'il est servi : un vrai `McpServer`, rempli par
 * `registerOnmangekoi`. On fige la liste exacte des tools et des prompts —
 * un tool en double ou oublié pendant une fusion se voit ici — et la
 * frontière entre les deux modes de connexion : un jeton personnel n'ouvre
 * que le catalogue et les listes.
 */

const mocks = vi.hoisted(() => ({
  placesEnabled: true,
  getMyStats: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/data-access/places', () => ({
  isPlacesSearchEnabled: () => mocks.placesEnabled,
  getPlaceDetails: vi.fn(),
  searchPlaces: vi.fn(),
}))
vi.mock('@/data-access/stats', () => ({ getMyStats: mocks.getMyStats }))

const { MCP_INSTRUCTIONS, registerOnmangekoi } = await import('@/lib/mcp/server')

/** Ouverts aux deux modes : catalogue, listes, identité, classement public. */
const SHARED_TOOLS = [
  'add_restaurant',
  'add_to_list',
  'create_list',
  'find_restaurant',
  'get_list',
  'get_public_results',
  'my_lists',
  'remember_restaurant',
  'remove_from_list',
  'search_google_places',
  'search_restaurants',
  'whoami',
]

/** Réservés à OAuth : historique, sessions, votes, profil. */
const OAUTH_TOOLS = [
  'add_restaurants_to_session',
  'close_session',
  'confirm_decision',
  'create_session',
  'get_food_constraints',
  'get_results',
  'get_session',
  'get_shared_list',
  'join_session',
  'launch_session',
  'my_sessions',
  'my_stats',
  'set_food_constraints',
  'set_results_public',
  'start_session_from_list',
  'suggest_restaurants',
  'vote',
]

interface Internals {
  _registeredTools: Record<
    string,
    { handler: (args: unknown, ctx: unknown) => Promise<CallToolResult> }
  >
  _registeredPrompts: Record<string, unknown>
}

function createServer(): Internals {
  const server = new McpServer({ name: 'onmangekoi', version: 'test' })
  registerOnmangekoi(server)
  // Le SDK n'expose pas la liste sans transport ; ses champs internes suffisent ici.
  return server as unknown as Internals
}

const PERSONAL_TOKEN = `omk_${'d'.repeat(48)}`
const TOKEN_AUTH: AuthInfo = {
  token: PERSONAL_TOKEN,
  clientId: 'onmangekoi-personal-token',
  scopes: [],
  extra: { caller: { mode: 'token', token: PERSONAL_TOKEN } },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.placesEnabled = true
})

describe('registerOnmangekoi', () => {
  it('enregistre exactement les tools attendus', () => {
    const names = Object.keys(createServer()._registeredTools).sort()
    expect(names).toEqual([...SHARED_TOOLS, ...OAUTH_TOOLS].sort())
  })

  it('ne propose pas la recherche Google sans clé', () => {
    mocks.placesEnabled = false
    const names = Object.keys(createServer()._registeredTools)
    expect(names).not.toContain('search_google_places')
    expect(names).toHaveLength(SHARED_TOOLS.length + OAUTH_TOOLS.length - 1)
  })

  it('enregistre exactement les prompts attendus', () => {
    expect(Object.keys(createServer()._registeredPrompts).sort()).toEqual([
      'jai-mange',
      'partager-une-liste',
    ])
  })

  it('décrit les deux modes de connexion dans ses consignes', () => {
    expect(MCP_INSTRUCTIONS).toContain('OAuth')
    expect(MCP_INSTRUCTIONS).toContain('omk_')
    expect(MCP_INSTRUCTIONS).toContain('requires_oauth')
    expect(MCP_INSTRUCTIONS).toContain('remember_restaurant')
  })
})

describe('mode jeton personnel', () => {
  it.each(OAUTH_TOOLS)('%s rend requires_oauth sans rien appeler', async (name) => {
    const tool = createServer()._registeredTools[name]
    // Les arguments importent peu : le refus précède toute lecture.
    const result = await tool.handler({}, { http: { authInfo: TOKEN_AUTH } })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ text: expect.stringMatching(/^requires_oauth:/) })
  })

  it('ne lit rien pour un tool réservé à OAuth', async () => {
    await createServer()._registeredTools.my_stats.handler({}, { http: { authInfo: TOKEN_AUTH } })
    expect(mocks.getMyStats).not.toHaveBeenCalled()
  })
})
