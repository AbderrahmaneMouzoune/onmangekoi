import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { Restaurant } from '@/data-access/models'
import type { AuthInfo, CallToolResult, McpServer } from '@modelcontextprotocol/server'

vi.mock('server-only', () => ({}))

/**
 * Tools du catalogue. L'accès aux données est bouchonné : on vérifie ce que
 * la couche MCP ajoute — schémas JSON sans coercition, sorties minimisées
 * (jamais `created_by`), identifiants collés sous forme de lien, et la même
 * invalidation de cache que la Server Action.
 */

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  getRestaurantCatalogPage: vi.fn(),
  createManualRestaurant: vi.fn(),
  getRestaurantsByIds: vi.fn(),
  getRestaurantSuggestions: vi.fn(),
  getRecentWinners: vi.fn(),
  getPublicResults: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }))
vi.mock('@/i18n/server', () => ({
  translateError: async (error: unknown) =>
    error instanceof Error ? error.message.replace(/^omk:/, '') : 'error',
  revalidateLocalizedPath: vi.fn(),
}))
vi.mock('@/data-access/restaurants', () => ({
  RESTAURANTS_CACHE_TAG: 'restaurants',
  RESTAURANTS_CACHE_PROFILE: 'hours',
  snapOrigin: (origin: { lat: number; lng: number } | null) =>
    origin
      ? { lat: Math.round(origin.lat * 1000) / 1000, lng: Math.round(origin.lng * 1000) / 1000 }
      : null,
  getRestaurantCatalogPage: mocks.getRestaurantCatalogPage,
  createManualRestaurant: mocks.createManualRestaurant,
  getRestaurantsByIds: mocks.getRestaurantsByIds,
}))
vi.mock('@/data-access/suggestions', () => ({
  getRestaurantSuggestions: mocks.getRestaurantSuggestions,
}))
vi.mock('@/data-access/recent-winners', () => ({ getRecentWinners: mocks.getRecentWinners }))
vi.mock('@/data-access/public-results', () => ({ getPublicResults: mocks.getPublicResults }))

const { lastPathSegment, parseInput, registerCatalogTools, toRestaurantOutput } =
  await import('./catalog')
const { CreateRestaurantSchema } = await import('@/domain/schemas/restaurant')

const USER_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const AUTH: AuthInfo = {
  token: 'token',
  clientId: 'client',
  scopes: [],
  extra: { caller: { userId: USER_ID, isAnonymous: false, clientId: 'client' } },
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
  registerCatalogTools(server)
  return tools
}

/** Appel tel que le SDK le fait : entrée validée, puis sortie vérifiée. */
async function call(name: string, args: unknown) {
  const tool = registerAll().get(name)
  if (!tool) throw new Error(`unknown tool ${name}`)
  const result = await tool.cb(tool.config.inputSchema.parse(args), { http: { authInfo: AUTH } })
  if (!result.isError) tool.config.outputSchema.parse(result.structuredContent)
  return result
}

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: '3b241101-e2bb-4255-8caf-4136c566a962',
    name: 'Chez Mamie',
    cuisine_type: 'Française',
    address: '1 rue de la Paix',
    city: 'Paris',
    price_level: 2,
    tags: ['vegetarian'],
    description: null,
    website: null,
    location: { lat: 48.8686, lng: 2.3314 },
    opening_hours: null,
    created_at: '2026-10-01T12:00:00Z',
    created_by: 'a1b2c3d4-0000-4000-8000-000000000000',
    photo_url: 'https://example.com/photo.jpg',
    place_id: 'ChIJ123',
    source: 'manual',
    ...overrides,
  } as Restaurant
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('toRestaurantOutput', () => {
  it("ne laisse sortir ni l'auteur ni les champs internes", () => {
    const output = toRestaurantOutput(restaurant())
    expect(output).not.toHaveProperty('created_by')
    expect(output).not.toHaveProperty('place_id')
    expect(output).not.toHaveProperty('photo_url')
    expect(output).toMatchObject({
      name: 'Chez Mamie',
      location: { lat: 48.8686, lng: 2.3314 },
      open_now: null,
    })
    expect(output.directions_url).toContain('google.com/maps')
  })

  it('résume les horaires en « ouvert maintenant »', () => {
    // Mercredi 4 novembre 2026, 12 h 30 à Paris.
    const now = new Date('2026-11-04T11:30:00Z')
    const opening_hours = {
      timezone: 'Europe/Paris',
      periods: [{ day: 3, open: '12:00', close: '14:30' }],
    }
    expect(toRestaurantOutput(restaurant({ opening_hours }), now).open_now).toBe(true)
  })
})

describe('lastPathSegment', () => {
  it('garde un code tel quel', () => {
    expect(lastPathSegment(' 7K3M9P2QWX ')).toBe('7K3M9P2QWX')
  })

  it("extrait le code d'un lien collé, query et fragment ignorés", () => {
    expect(lastPathSegment('https://onmangekoi.app/fr/r/7K3M9P2QWX?utm=x#top')).toBe('7K3M9P2QWX')
    expect(lastPathSegment('/l/7K3M9P2QWX/')).toBe('7K3M9P2QWX')
  })
})

describe('parseInput', () => {
  it('normalise comme le formulaire', () => {
    expect(parseInput(CreateRestaurantSchema, { name: '  Sushi  ', city: '  ' })).toEqual({
      name: 'Sushi',
      cuisineType: null,
      address: null,
      city: null,
      priceLevel: null,
      tags: [],
    })
  })

  it('remonte le code métier d’un refus', () => {
    expect(() => parseInput(CreateRestaurantSchema, { name: 'x' })).toThrow(
      'omk:invalid_restaurant_name'
    )
  })
})

describe('schémas', () => {
  it('se traduisent tous en JSON Schema', () => {
    for (const [, tool] of registerAll()) {
      expect(() => z.toJSONSchema(tool.config.inputSchema, { io: 'input' })).not.toThrow()
      expect(() => z.toJSONSchema(tool.config.outputSchema, { io: 'output' })).not.toThrow()
    }
  })

  it('refusent les chaînes là où un formulaire les aurait converties', () => {
    const tools = registerAll()
    expect(() =>
      tools.get('add_restaurant')!.config.inputSchema.parse({ name: 'Sushi', priceLevel: '2' })
    ).toThrow()
    expect(() =>
      tools.get('search_restaurants')!.config.inputSchema.parse({ priceMax: '3' })
    ).toThrow()
  })

  it('annotent honnêtement lectures et écritures', () => {
    const tools = registerAll()
    expect(tools.get('search_restaurants')!.config.annotations.readOnlyHint).toBe(true)
    expect(tools.get('add_restaurant')!.config.annotations.readOnlyHint).toBe(false)
  })
})

describe('search_restaurants', () => {
  it('arrondit la position et minimise les résultats', async () => {
    mocks.getRestaurantCatalogPage.mockResolvedValue({
      items: [restaurant()],
      hasMore: true,
      nextOffset: 20,
    })

    const result = await call('search_restaurants', {
      query: 'sushi',
      origin: { lat: 48.868612, lng: 2.331412 },
      withinKm: 1,
    })

    expect(mocks.getRestaurantCatalogPage).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'sushi', origin: { lat: 48.869, lng: 2.331 }, withinKm: 1 })
    )
    expect(result.structuredContent).toMatchObject({ hasMore: true, nextOffset: 20 })
    expect(JSON.stringify(result)).not.toContain('a1b2c3d4')
  })
})

describe('add_restaurant', () => {
  it('crée le restaurant et purge le cache du catalogue', async () => {
    mocks.createManualRestaurant.mockResolvedValue(restaurant({ name: 'Sushi' }))

    const result = await call('add_restaurant', { name: ' Sushi ', priceLevel: 3, tags: ['vegan'] })

    expect(mocks.createManualRestaurant).toHaveBeenCalledWith(expect.anything(), {
      name: 'Sushi',
      cuisineType: null,
      address: null,
      city: null,
      priceLevel: 3,
      tags: ['vegan'],
    })
    expect(mocks.revalidateTag).toHaveBeenCalledWith('restaurants', 'hours')
    expect(result.isError).toBeFalsy()
  })

  it('accepte `null` pour un champ inconnu, comme un agent l’envoie souvent', async () => {
    mocks.createManualRestaurant.mockResolvedValue(restaurant({ name: 'Sushi' }))

    const result = await call('add_restaurant', {
      name: 'Sushi',
      cuisineType: null,
      address: '  ',
      city: null,
      priceLevel: null,
      tags: null,
    })

    expect(mocks.createManualRestaurant).toHaveBeenCalledWith(expect.anything(), {
      name: 'Sushi',
      cuisineType: null,
      address: null,
      city: null,
      priceLevel: null,
      tags: [],
    })
    expect(result.isError).toBeFalsy()
  })

  it('ne purge rien quand la base refuse', async () => {
    mocks.createManualRestaurant.mockRejectedValue(new Error('omk:invalid_restaurant'))
    const result = await call('add_restaurant', { name: 'Sushi' })
    expect(result.isError).toBe(true)
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })
})

describe('suggest_restaurants', () => {
  it('joint les noms des gagnants récents', async () => {
    mocks.getRestaurantSuggestions.mockResolvedValue([
      { restaurant: restaurant(), reason: 'recent', source: 'history', excluded_winners: 1 },
    ])
    mocks.getRecentWinners.mockResolvedValue([
      { restaurant_id: 'w1', last_won_at: '2026-10-30T12:00:00Z' },
      { restaurant_id: 'gone', last_won_at: '2026-10-29T12:00:00Z' },
    ])
    mocks.getRestaurantsByIds.mockResolvedValue([restaurant({ id: 'w1', name: 'Le Gagnant' })])

    const result = await call('suggest_restaurants', {})

    expect(mocks.getRestaurantSuggestions).toHaveBeenCalledWith(expect.anything(), 5)
    expect(result.structuredContent).toMatchObject({
      suggestions: [{ reason: 'recent', source: 'history', restaurant: { name: 'Chez Mamie' } }],
      recentWinners: [{ id: 'w1', name: 'Le Gagnant', lastWonAt: '2026-10-30T12:00:00Z' }],
    })
  })
})

describe('get_public_results', () => {
  it('lit le code depuis un lien et rend le podium sans photo', async () => {
    const row = {
      rank: 1,
      restaurant_name: 'Chez Mamie',
      cuisine_type: null,
      city: 'Paris',
      photo_url: 'https://example.com/p.jpg',
      score: 7,
      votes_count: 4,
      decided: true,
    }
    mocks.getPublicResults.mockResolvedValue({
      sessionName: 'Midi',
      closedAt: '2026-11-04T13:00:00Z',
      participantCount: 4,
      podium: [row],
      decision: row,
    })

    const result = await call('get_public_results', {
      results: 'https://onmangekoi.test/r/7k3m9p2qwx',
    })

    expect(mocks.getPublicResults).toHaveBeenCalledWith('7K3M9P2QWX')
    expect(result.structuredContent).toMatchObject({
      sessionName: 'Midi',
      url: 'https://onmangekoi.test/r/7K3M9P2QWX',
    })
    expect(JSON.stringify(result.structuredContent)).not.toContain('photo')
  })

  it('refuse un code illisible sans appeler la base', async () => {
    const result = await call('get_public_results', { results: 'nope' })
    expect(result.isError).toBe(true)
    expect(mocks.getPublicResults).not.toHaveBeenCalled()
  })

  it('signale un classement non publié', async () => {
    mocks.getPublicResults.mockResolvedValue(null)
    const result = await call('get_public_results', { results: '7K3M9P2QWX' })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining('session_not_found') })
  })
})
