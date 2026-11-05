import { describe, expect, it, vi } from 'vitest'

import type { RememberRestaurantDeps } from './remember-restaurant'
import type { McpAccess, McpFoundRestaurant, McpList } from '@/data-access/mcp'
import type { PlaceResult } from '@/domain/places'

vi.mock('server-only', () => ({}))

const mcp = vi.hoisted(() => ({
  mcpFindRestaurants: vi.fn(),
  mcpLists: vi.fn(),
  mcpCreateList: vi.fn(),
  mcpAddToList: vi.fn(),
}))
vi.mock('@/data-access/mcp', () => mcp)

const { rememberRestaurantDeps, rememberRestaurantUseCase } = await import('./remember-restaurant')

const LIST: McpList = {
  id: 'list-1',
  name: 'Le midi au bureau',
  share_code: 'ABCDEFGHJK',
  is_public: false,
  is_collaborative: false,
  restaurant_count: 3,
  updated_at: '2026-11-05T12:00:00Z',
}
const OTHER_LIST: McpList = { ...LIST, id: 'list-2', name: 'Le soir' }

const LA_BA: McpFoundRestaurant = { id: 'r-1', name: 'La Ba', city: 'Paris', in_my_lists: [] }
const BARAKA: McpFoundRestaurant = { id: 'r-2', name: 'La Baraka', city: 'Paris', in_my_lists: [] }

function place(name: string, placeId = `place-${name}`): PlaceResult {
  return {
    placeId,
    name,
    address: '1 rue du Test, Paris',
    city: 'Paris',
    cuisineType: 'Vietnamien',
    priceLevel: 2,
    location: null,
    rating: null,
    ratingCount: null,
    tags: [],
    description: null,
    website: null,
    openingHours: null,
    photoName: null,
    photoUrl: null,
  }
}

function deps(overrides: Partial<RememberRestaurantDeps> = {}): RememberRestaurantDeps {
  return {
    findRestaurants: vi.fn().mockResolvedValue([]),
    searchPlaces: vi.fn().mockResolvedValue([]),
    importPlace: vi.fn().mockResolvedValue({ id: 'imported', name: 'La Ba' }),
    lists: vi.fn().mockResolvedValue([LIST]),
    createList: vi.fn().mockImplementation(async (name: string) => ({ ...LIST, id: 'new', name })),
    addToList: vi.fn().mockImplementation(async (listId: string, restaurantId: string) => ({
      added: true,
      already_in_list: false,
      list: { ...LIST, id: listId },
      restaurant: { id: restaurantId, name: 'La Ba' },
    })),
    ...overrides,
  }
}

const INPUT = { name: 'la ba', defaultListName: 'Mes bonnes adresses' }

describe('rememberRestaurantUseCase', () => {
  it('should file a restaurant the app already knows, without asking Google', async () => {
    const d = deps({ findRestaurants: vi.fn().mockResolvedValue([BARAKA, LA_BA]) })

    const result = await rememberRestaurantUseCase(d, INPUT)

    expect(result).toMatchObject({ status: 'added', restaurant_source: 'catalog' })
    expect(d.addToList).toHaveBeenCalledWith('list-1', 'r-1')
    expect(d.searchPlaces).not.toHaveBeenCalled()
  })

  it('should import from Google when the catalog has no restaurant by that name', async () => {
    const d = deps({
      findRestaurants: vi.fn().mockResolvedValue([BARAKA]),
      searchPlaces: vi.fn().mockResolvedValue([place('Restaurant La Ba', 'ChIJlaba')]),
    })

    const result = await rememberRestaurantUseCase(d, { ...INPUT, city: 'Paris' })

    expect(d.searchPlaces).toHaveBeenCalledWith('la ba Paris')
    expect(d.importPlace).toHaveBeenCalledWith('ChIJlaba')
    expect(result).toMatchObject({ status: 'added', restaurant_source: 'google' })
  })

  it('should say so when the restaurant is already in the list', async () => {
    const d = deps({
      findRestaurants: vi.fn().mockResolvedValue([LA_BA]),
      addToList: vi.fn().mockResolvedValue({
        added: false,
        already_in_list: true,
        list: LIST,
        restaurant: LA_BA,
      }),
    })

    await expect(rememberRestaurantUseCase(d, INPUT)).resolves.toMatchObject({
      status: 'already_in_list',
    })
  })

  it('should return candidates instead of guessing between look-alikes', async () => {
    const d = deps({
      findRestaurants: vi.fn().mockResolvedValue([BARAKA]),
      searchPlaces: vi.fn().mockResolvedValue([place('La Bastide')]),
    })

    const result = await rememberRestaurantUseCase(d, INPUT)

    expect(result).toMatchObject({
      status: 'ambiguous',
      catalog_candidates: [BARAKA],
      google_candidates: [{ google_place_id: 'place-La Bastide', name: 'La Bastide' }],
    })
    expect(d.importPlace).not.toHaveBeenCalled()
    expect(d.addToList).not.toHaveBeenCalled()
  })

  it('should report not found, and never invent a restaurant', async () => {
    const d = deps()

    await expect(rememberRestaurantUseCase(d, INPUT)).resolves.toEqual({
      status: 'not_found',
      google_searched: true,
    })
  })

  it('should stay within the catalog when Google is not configured', async () => {
    const d = deps({ searchPlaces: undefined })

    await expect(rememberRestaurantUseCase(d, INPUT)).resolves.toEqual({
      status: 'not_found',
      google_searched: false,
    })
  })

  it('should ask which list when there are several, before importing anything', async () => {
    const d = deps({
      lists: vi.fn().mockResolvedValue([LIST, OTHER_LIST]),
      searchPlaces: vi.fn().mockResolvedValue([place('La Ba')]),
    })

    await expect(rememberRestaurantUseCase(d, INPUT)).resolves.toEqual({
      status: 'choose_list',
      lists: [LIST, OTHER_LIST],
    })
    expect(d.importPlace).not.toHaveBeenCalled()
  })

  it('should point to the list that already holds it, instead of asking which one', async () => {
    const filed = { ...LA_BA, in_my_lists: [{ id: 'list-2', name: 'Le soir' }] }
    const d = deps({
      lists: vi.fn().mockResolvedValue([LIST, OTHER_LIST]),
      findRestaurants: vi.fn().mockResolvedValue([filed]),
    })

    await rememberRestaurantUseCase(d, INPUT)

    expect(d.addToList).toHaveBeenCalledWith('list-2', 'r-1')
  })

  it('should create a first list for someone who has none', async () => {
    const d = deps({
      lists: vi.fn().mockResolvedValue([]),
      findRestaurants: vi.fn().mockResolvedValue([LA_BA]),
    })

    const result = await rememberRestaurantUseCase(d, INPUT)

    expect(d.createList).toHaveBeenCalledWith('Mes bonnes adresses')
    expect(result).toMatchObject({ status: 'added', list_created: true })
  })

  it('should reuse a list named loosely, and create it when it does not exist', async () => {
    const found = deps({
      lists: vi.fn().mockResolvedValue([LIST, OTHER_LIST]),
      findRestaurants: vi.fn().mockResolvedValue([LA_BA]),
    })
    await rememberRestaurantUseCase(found, { ...INPUT, listName: 'le SOIR' })
    expect(found.addToList).toHaveBeenCalledWith('list-2', 'r-1')

    const created = deps({ findRestaurants: vi.fn().mockResolvedValue([LA_BA]) })
    await rememberRestaurantUseCase(created, { ...INPUT, listName: 'Brunchs' })
    expect(created.createList).toHaveBeenCalledWith('Brunchs')
  })
})

describe('rememberRestaurantDeps', () => {
  const access = { client: {}, token: 'omk_test' } as unknown as McpAccess

  it('should act for the caller given by the access, token or OAuth alike', async () => {
    const d = rememberRestaurantDeps(access, null)
    await d.findRestaurants({ query: 'la ba', city: 'Paris' })
    await d.lists()
    await d.createList('Brunchs')
    await d.addToList('list-1', 'r-1')

    expect(mcp.mcpFindRestaurants).toHaveBeenCalledWith(access, { query: 'la ba', city: 'Paris' })
    expect(mcp.mcpLists).toHaveBeenCalledWith(access)
    expect(mcp.mcpCreateList).toHaveBeenCalledWith(access, 'Brunchs')
    expect(mcp.mcpAddToList).toHaveBeenCalledWith(access, 'list-1', 'r-1')
  })

  it('should stick to the catalog without Google', async () => {
    const d = rememberRestaurantDeps(access, null)
    expect(d.searchPlaces).toBeUndefined()
    await expect(d.importPlace('place-1')).rejects.toThrow('omk:places_not_configured')
  })

  it('should use the Google functions it is given', async () => {
    const google = {
      searchPlaces: vi.fn().mockResolvedValue([]),
      importPlace: vi.fn().mockResolvedValue({ id: 'r-9', name: 'La Ba' }),
    }
    const d = rememberRestaurantDeps(access, google)
    await d.searchPlaces?.('la ba')
    await d.importPlace('place-1')
    expect(google.searchPlaces).toHaveBeenCalledWith('la ba')
    expect(google.importPlace).toHaveBeenCalledWith('place-1')
  })
})
