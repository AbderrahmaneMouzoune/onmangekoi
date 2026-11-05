import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { SessionHistoryEntry } from '@/data-access/models'
import type { AuthInfo, CallToolResult, McpServer } from '@modelcontextprotocol/server'

vi.mock('server-only', () => ({}))

/**
 * Tools « moi ». L'accès aux données est bouchonné : on vérifie la forme des
 * sorties (pas d'uuid de session, pas d'email), la pagination de
 * l'historique et l'écriture des contraintes, revalidation de `/account`
 * comprise.
 */

const mocks = vi.hoisted(() => ({
  revalidateLocalizedPath: vi.fn(),
  getProfile: vi.fn(),
  getMySessionHistory: vi.fn(),
  getMyStats: vi.fn(),
  getMyFoodConstraints: vi.fn(),
  saveMyFoodConstraints: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/i18n/server', () => ({
  translateError: async (error: unknown) =>
    error instanceof Error ? error.message.replace(/^omk:/, '') : 'error',
  revalidateLocalizedPath: mocks.revalidateLocalizedPath,
}))
vi.mock('@/data-access/restaurants', () => ({}))
vi.mock('@/data-access/suggestions', () => ({}))
vi.mock('@/data-access/recent-winners', () => ({}))
vi.mock('@/data-access/public-results', () => ({}))
vi.mock('@/data-access/profile', () => ({ getProfile: mocks.getProfile }))
vi.mock('@/data-access/sessions', () => ({ getMySessionHistory: mocks.getMySessionHistory }))
vi.mock('@/data-access/stats', () => ({ getMyStats: mocks.getMyStats }))
vi.mock('@/data-access/food-constraints', () => ({
  getMyFoodConstraints: mocks.getMyFoodConstraints,
  saveMyFoodConstraints: mocks.saveMyFoodConstraints,
}))

const { registerMeTools, toHistoryEntry, toStatsOutput } = await import('./me')

const USER_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const SESSION_ID = '1c6b1a4e-58f1-4b8d-9e0a-6a2e3f5d7c11'

const AUTH: AuthInfo = {
  token: 'token',
  clientId: 'client',
  scopes: [],
  extra: { caller: { userId: USER_ID, isAnonymous: true, clientId: 'client' } },
}

interface Registered {
  config: { inputSchema: z.ZodType; outputSchema: z.ZodType; annotations: Record<string, boolean> }
  cb: (args: unknown, ctx: unknown) => Promise<CallToolResult>
}

function registerAll(): Map<string, Registered> {
  const tools = new Map<string, Registered>()
  const server = {
    registerTool: (name: string, config: Registered['config'], cb: Registered['cb']) =>
      tools.set(name, { config, cb }),
  } as unknown as McpServer
  registerMeTools(server)
  return tools
}

async function call(name: string, args: unknown) {
  const tool = registerAll().get(name)
  if (!tool) throw new Error(`unknown tool ${name}`)
  const result = await tool.cb(tool.config.inputSchema.parse(args), { http: { authInfo: AUTH } })
  if (!result.isError) tool.config.outputSchema.parse(result.structuredContent)
  return result
}

function entry(overrides: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry {
  return {
    id: SESSION_ID,
    invite_code: '7K3M9P',
    name: 'Midi',
    status: 'closed',
    is_host: true,
    created_at: '2026-11-04T10:00:00Z',
    closed_at: '2026-11-04T12:00:00Z',
    participant_count: 4,
    restaurant_count: 6,
    winner_name: 'Chez Mamie',
    winner_score: 7,
    winner_decided: true,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('toHistoryEntry', () => {
  it("adresse la session par son code, jamais par l'uuid", () => {
    const output = toHistoryEntry(entry())
    expect(JSON.stringify(output)).not.toContain(SESSION_ID)
    expect(output).toMatchObject({
      code: '7K3M9P',
      url: 'https://onmangekoi.test/sessions/7K3M9P',
      resultsUrl: 'https://onmangekoi.test/sessions/7K3M9P/results',
      winner: { name: 'Chez Mamie', score: 7, decided: true },
    })
  })

  it("n'a ni gagnant ni classement tant que la session est ouverte", () => {
    const output = toHistoryEntry(
      entry({
        status: 'voting',
        closed_at: null,
        winner_name: null,
        winner_score: null,
        winner_decided: null,
      })
    )
    expect(output.winner).toBeNull()
    expect(output.resultsUrl).toBeNull()
  })
})

describe('toStatsOutput', () => {
  it('rend des zéros sans statistiques', () => {
    expect(toStatsOutput(null)).toMatchObject({
      sessionsTotal: 0,
      favouriteCuisine: null,
      topRestaurant: null,
    })
  })
})

describe('schémas', () => {
  it('se traduisent tous en JSON Schema', () => {
    for (const [, tool] of registerAll()) {
      expect(() => z.toJSONSchema(tool.config.inputSchema, { io: 'input' })).not.toThrow()
      expect(() => z.toJSONSchema(tool.config.outputSchema, { io: 'output' })).not.toThrow()
    }
  })

  it('exigent des types JSON stricts pour les contraintes', () => {
    const schema = registerAll().get('set_food_constraints')!.config.inputSchema
    expect(() => schema.parse({ tags: [], maxPriceLevel: '2' })).toThrow()
    expect(() => schema.parse({ tags: ['vegan'] })).toThrow()
  })
})

describe('whoami', () => {
  it('rend le pseudo et le type de compte, sans email', async () => {
    mocks.getProfile.mockResolvedValue({ id: USER_ID, pseudo: 'Sam' })
    const result = await call('whoami', {})
    expect(mocks.getProfile).toHaveBeenCalledWith(expect.anything(), USER_ID)
    expect(result.structuredContent).toMatchObject({
      pseudo: 'Sam',
      isAnonymous: true,
      accountUrl: 'https://onmangekoi.test/account',
    })
    expect(JSON.stringify(result)).not.toContain(USER_ID)
  })
})

describe('my_sessions', () => {
  it('pagine par curseur', async () => {
    mocks.getMySessionHistory.mockResolvedValue({ entries: [entry()], nextCursor: 'abc' })
    const result = await call('my_sessions', { cursor: 'xyz', limit: 5 })
    expect(mocks.getMySessionHistory).toHaveBeenCalledWith(expect.anything(), {
      limit: 5,
      cursor: 'xyz',
    })
    expect(result.structuredContent).toMatchObject({ nextCursor: 'abc' })
  })

  it('part de la première page par défaut', async () => {
    mocks.getMySessionHistory.mockResolvedValue({ entries: [], nextCursor: null })
    await call('my_sessions', {})
    expect(mocks.getMySessionHistory).toHaveBeenCalledWith(expect.anything(), {
      limit: 12,
      cursor: null,
    })
  })
})

describe('food constraints', () => {
  it('lit ses contraintes', async () => {
    mocks.getMyFoodConstraints.mockResolvedValue({ tags: ['halal'], maxPriceLevel: 2 })
    const result = await call('get_food_constraints', {})
    expect(mocks.getMyFoodConstraints).toHaveBeenCalledWith(expect.anything(), USER_ID)
    expect(result.structuredContent).toMatchObject({ tags: ['halal'], maxPriceLevel: 2 })
  })

  it('remplace ses contraintes dans l’ordre du catalogue et revalide /account', async () => {
    const result = await call('set_food_constraints', {
      tags: ['gluten_free', 'vegan', 'vegan'],
      maxPriceLevel: null,
    })
    expect(mocks.saveMyFoodConstraints).toHaveBeenCalledWith(expect.anything(), {
      tags: ['vegan', 'gluten_free'],
      maxPriceLevel: null,
    })
    expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith('/account')
    expect(result.structuredContent).toMatchObject({ tags: ['vegan', 'gluten_free'] })
  })
})
