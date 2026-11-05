import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { Restaurant } from '@/data-access/models'
import type { AuthInfo, CallToolResult, McpServer } from '@modelcontextprotocol/server'

vi.mock('server-only', () => ({}))

/**
 * Tools du catalogue. L'accès aux données est bouchonné : on vérifie ce que
 * la couche MCP ajoute — schémas JSON sans coercition, sorties minimisées
 * (jamais `created_by`), identifiants collés sous forme de lien, la même
 * invalidation de cache que la Server Action, et l'ouverture aux jetons
 * personnels de tout sauf les suggestions.
 */

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  getRestaurantCatalogPage: vi.fn(),
  mcpCreateRestaurant: vi.fn(),
  mcpFindRestaurants: vi.fn(),
  mcpImportPlace: vi.fn(),
  getPlaceDetails: vi.fn(),
  searchPlaces: vi.fn(),
  placesEnabled: true,
  getRestaurantsByIds: vi.fn(),
  getRestaurantSuggestions: vi.fn(),
  getRecentWinners: vi.fn(),
  getPublicResults: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'fr' }))
vi.mock('@/data-access/mcp', () => ({
  mcpCreateRestaurant: mocks.mcpCreateRestaurant,
  mcpFindRestaurants: mocks.mcpFindRestaurants,
  mcpImportPlace: mocks.mcpImportPlace,
}))
vi.mock('@/data-access/places', () => ({
  isPlacesSearchEnabled: () => mocks.placesEnabled,
  getPlaceDetails: mocks.getPlaceDetails,
  searchPlaces: mocks.searchPlaces,
}))
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
  extra: { caller: { mode: 'oauth', userId: USER_ID, isAnonymous: false, clientId: 'client' } },
}

const PERSONAL_TOKEN = `omk_${'b'.repeat(48)}`
const TOKEN_AUTH: AuthInfo = {
  token: PERSONAL_TOKEN,
  clientId: 'onmangekoi-personal-token',
  scopes: [],
  extra: { caller: { mode: 'token', token: PERSONAL_TOKEN } },
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
async function call(name: string, args: unknown, authInfo: AuthInfo = AUTH) {
  const tool = registerAll().get(name)
  if (!tool) throw new Error(`unknown tool ${name}`)
  const result = await tool.cb(tool.config.inputSchema.parse(args), { http: { authInfo } })
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
  mocks.placesEnabled = true
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

describe('find_restaurant', () => {
  it('cherche pour le porteur du jeton et minimise la sortie', async () => {
    mocks.mcpFindRestaurants.mockResolvedValue([
      {
        id: 'r-1',
        name: 'La Ba',
        city: 'Paris',
        source: 'google',
        google_place_id: 'ChIJ123',
        in_my_lists: [{ id: 'l-1', name: 'Le midi' }],
      },
    ])

    const result = await call('find_restaurant', { query: 'la ba', city: null }, TOKEN_AUTH)

    expect(mocks.mcpFindRestaurants).toHaveBeenCalledWith(
      expect.objectContaining({ token: PERSONAL_TOKEN }),
      { query: 'la ba', city: null, limit: 8 }
    )
    expect(result.structuredContent).toEqual({
      restaurants: [
        {
          id: 'r-1',
          name: 'La Ba',
          cuisine_type: null,
          address: null,
          city: 'Paris',
          price_level: null,
          tags: [],
          website: null,
          in_my_lists: [{ id: 'l-1', name: 'Le midi' }],
        },
      ],
    })
  })
})

describe('search_google_places', () => {
  it("n'existe pas sans clé Google", () => {
    mocks.placesEnabled = false
    expect(registerAll().has('search_google_places')).toBe(false)
    mocks.placesEnabled = true
    expect(registerAll().has('search_google_places')).toBe(true)
  })

  it('cherche dans la langue de la requête', async () => {
    mocks.searchPlaces.mockResolvedValue({
      places: [
        {
          placeId: 'ChIJ1',
          name: 'La Ba',
          address: '1 rue X',
          city: 'Paris',
          cuisineType: 'Vietnamien',
          rating: 4.5,
          photoUrl: 'https://example.com/p.jpg',
        },
      ],
    })
    const result = await call('search_google_places', { query: 'La Ba Paris' }, TOKEN_AUTH)
    expect(mocks.searchPlaces).toHaveBeenCalledWith({ locale: 'fr', query: 'La Ba Paris' })
    expect(result.structuredContent).toMatchObject({
      places: [{ google_place_id: 'ChIJ1', name: 'La Ba', rating: 4.5 }],
    })
    expect(JSON.stringify(result)).not.toContain('photo')
  })
})

describe('add_restaurant', () => {
  it('crée le restaurant à la main et purge le cache du catalogue', async () => {
    mocks.mcpCreateRestaurant.mockResolvedValue({ id: 'r-1', name: 'Sushi' })

    const result = await call('add_restaurant', { name: ' Sushi ', priceLevel: 3, tags: ['vegan'] })

    expect(mocks.mcpCreateRestaurant).toHaveBeenCalledWith(
      expect.objectContaining({ token: null }),
      {
        name: 'Sushi',
        cuisineType: null,
        address: null,
        city: null,
        priceLevel: 3,
        tags: ['vegan'],
      }
    )
    expect(mocks.revalidateTag).toHaveBeenCalledWith('restaurants', 'hours')
    expect(result.isError).toBeFalsy()
  })

  it('accepte `null` pour un champ inconnu, comme un agent l’envoie souvent', async () => {
    mocks.mcpCreateRestaurant.mockResolvedValue({ id: 'r-1', name: 'Sushi' })

    const result = await call('add_restaurant', {
      name: 'Sushi',
      cuisineType: null,
      address: '  ',
      city: null,
      priceLevel: null,
      tags: null,
    })

    expect(mocks.mcpCreateRestaurant).toHaveBeenCalledWith(expect.anything(), {
      name: 'Sushi',
      cuisineType: null,
      address: null,
      city: null,
      priceLevel: null,
      tags: [],
    })
    expect(result.isError).toBeFalsy()
  })

  it('importe depuis Google la fiche relue côté serveur', async () => {
    const place = { placeId: 'ChIJ1', name: 'La Ba', tags: [] }
    mocks.getPlaceDetails.mockResolvedValue(place)
    mocks.mcpImportPlace.mockResolvedValue({ id: 'r-2', name: 'La Ba', google_place_id: 'ChIJ1' })

    const result = await call('add_restaurant', { googlePlaceId: 'ChIJ1' }, TOKEN_AUTH)

    expect(mocks.getPlaceDetails).toHaveBeenCalledWith('ChIJ1', 'fr')
    expect(mocks.mcpImportPlace).toHaveBeenCalledWith(
      expect.objectContaining({ token: PERSONAL_TOKEN }),
      place
    )
    expect(mocks.revalidateTag).toHaveBeenCalledWith('restaurants', 'hours')
    expect(result.structuredContent).toMatchObject({ restaurant: { id: 'r-2', name: 'La Ba' } })
    expect(JSON.stringify(result)).not.toContain('google_place_id')
  })

  it('exige un nom sans lieu Google', async () => {
    const result = await call('add_restaurant', {})
    expect(result.isError).toBe(true)
    expect(mocks.mcpCreateRestaurant).not.toHaveBeenCalled()
  })

  it('ne purge rien quand la base refuse', async () => {
    mocks.mcpCreateRestaurant.mockRejectedValue(new Error('omk:invalid_restaurant'))
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

describe('mode jeton personnel', () => {
  it('ouvre la recherche du catalogue', async () => {
    mocks.getRestaurantCatalogPage.mockResolvedValue({ items: [], hasMore: false, nextOffset: 0 })
    const result = await call('search_restaurants', { query: '' }, TOKEN_AUTH)
    expect(result.isError).toBeFalsy()
  })

  it('refuse les suggestions, tirées de l’historique', async () => {
    const result = await call('suggest_restaurants', {}, TOKEN_AUTH)
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ text: expect.stringMatching(/^requires_oauth:/) })
    expect(mocks.getRestaurantSuggestions).not.toHaveBeenCalled()
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
