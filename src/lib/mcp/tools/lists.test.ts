import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { List, ListWithRestaurants, Restaurant } from '@/data-access/models'
import type { AuthInfo, CallToolResult, McpServer } from '@modelcontextprotocol/server'

vi.mock('server-only', () => ({}))

/**
 * Tools des listes. L'accès aux données est bouchonné : on vérifie qu'une
 * liste s'adresse par code ou lien, qu'on n'écrit que dans les siennes,
 * qu'aucun uuid de liste ni de propriétaire ne sort, et que les écritures
 * purgent la page publique par `revalidateTag` — jamais `updateTag`, qui
 * lève dans un route handler.
 */

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  revalidateLocalizedPath: vi.fn(),
  getListsByOwner: vi.fn(),
  getListByParam: vi.fn(),
  addRestaurantsToList: vi.fn(),
  removeRestaurantFromList: vi.fn(),
  getSharedListPreview: vi.fn(),
  getSharedListRestaurants: vi.fn(),
  ownsSharedList: vi.fn(),
  getPublicList: vi.fn(),
  getPublicListRestaurants: vi.fn(),
  createListUseCase: vi.fn(),
  getRestaurantsByIds: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag, updateTag: mocks.updateTag }))
vi.mock('@/i18n/server', () => ({
  translateError: async (error: unknown) =>
    error instanceof Error ? error.message.replace(/^omk:/, '') : 'error',
  revalidateLocalizedPath: mocks.revalidateLocalizedPath,
}))
vi.mock('@/data-access/restaurants', () => ({ getRestaurantsByIds: mocks.getRestaurantsByIds }))
vi.mock('@/data-access/suggestions', () => ({}))
vi.mock('@/data-access/recent-winners', () => ({}))
vi.mock('@/data-access/public-results', () => ({}))
vi.mock('@/data-access/lists', () => ({
  getListsByOwner: mocks.getListsByOwner,
  getListByParam: mocks.getListByParam,
  addRestaurantsToList: mocks.addRestaurantsToList,
  removeRestaurantFromList: mocks.removeRestaurantFromList,
  getSharedListPreview: mocks.getSharedListPreview,
  getSharedListRestaurants: mocks.getSharedListRestaurants,
  ownsSharedList: mocks.ownsSharedList,
}))
vi.mock('@/data-access/public-lists', () => ({
  getPublicList: mocks.getPublicList,
  getPublicListRestaurants: mocks.getPublicListRestaurants,
  publicListCacheTag: (code: string) => `public-list:${code}`,
}))
vi.mock('@/use-cases/create-list', () => ({ createListUseCase: mocks.createListUseCase }))

const { registerListTools, toListSummary } = await import('./lists')

const USER_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const OTHER_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
const LIST_ID = '1c6b1a4e-58f1-4b8d-9e0a-6a2e3f5d7c11'
const R1 = '3b241101-e2bb-4255-8caf-4136c566a962'
const R2 = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b'

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
  registerListTools(server)
  return tools
}

async function call(name: string, args: unknown) {
  const tool = registerAll().get(name)
  if (!tool) throw new Error(`unknown tool ${name}`)
  const result = await tool.cb(tool.config.inputSchema.parse(args), { http: { authInfo: AUTH } })
  if (!result.isError) tool.config.outputSchema.parse(result.structuredContent)
  return result
}

function restaurant(id: string): Restaurant {
  return {
    id,
    name: `Resto ${id.slice(0, 4)}`,
    cuisine_type: null,
    address: null,
    city: null,
    price_level: null,
    tags: [],
    description: null,
    website: null,
    location: null,
    opening_hours: null,
    created_at: '2026-10-01T12:00:00Z',
    created_by: OTHER_ID,
    photo_url: null,
    place_id: null,
    source: 'manual',
  } as Restaurant
}

function list(overrides: Partial<ListWithRestaurants> = {}): ListWithRestaurants {
  return {
    id: LIST_ID,
    name: 'Près du bureau',
    owner_id: USER_ID,
    share_code: '7K3M9P2QWX',
    share_token: 'a'.repeat(32),
    is_public: false,
    is_collaborative: false,
    created_at: '2026-10-01T12:00:00Z',
    updated_at: '2026-10-02T12:00:00Z',
    restaurants: [restaurant(R1)],
    ...overrides,
  } as ListWithRestaurants
}

beforeEach(() => {
  vi.clearAllMocks()
  // Par défaut, tout id demandé existe au catalogue.
  mocks.getRestaurantsByIds.mockImplementation(async (_client: unknown, ids: string[]) =>
    ids.map(restaurant)
  )
})

describe('toListSummary', () => {
  it("rend le code et les liens, jamais l'uuid ni le propriétaire", () => {
    const summary = toListSummary(list(), 3)
    expect(summary).toEqual({
      code: '7K3M9P2QWX',
      name: 'Près du bureau',
      restaurantCount: 3,
      isPublic: false,
      isCollaborative: false,
      updatedAt: '2026-10-02T12:00:00Z',
      url: 'https://onmangekoi.test/lists/7K3M9P2QWX',
      shareUrl: 'https://onmangekoi.test/l/7K3M9P2QWX',
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

  it('plafonnent un ajout à 100 restaurants', () => {
    const schema = registerAll().get('add_restaurants_to_list')!.config.inputSchema
    expect(() =>
      schema.parse({ list: '7K3M9P2QWX', restaurantIds: Array.from({ length: 101 }, () => R1) })
    ).toThrow()
  })

  it('marquent le retrait comme destructif', () => {
    const tools = registerAll()
    expect(tools.get('remove_restaurant_from_list')!.config.annotations.destructiveHint).toBe(true)
    expect(tools.get('list_my_lists')!.config.annotations.readOnlyHint).toBe(true)
  })
})

describe('list_my_lists', () => {
  it("lit les listes de l'appelant", async () => {
    mocks.getListsByOwner.mockResolvedValue([{ ...list(), restaurant_count: 4 }])
    const result = await call('list_my_lists', {})
    expect(mocks.getListsByOwner).toHaveBeenCalledWith(expect.anything(), USER_ID)
    expect(result.structuredContent).toMatchObject({ lists: [{ restaurantCount: 4 }] })
    expect(JSON.stringify(result)).not.toContain(LIST_ID)
    expect(JSON.stringify(result)).not.toContain(USER_ID)
  })
})

describe('get_list', () => {
  it('accepte un lien collé', async () => {
    mocks.getListByParam.mockResolvedValue(list())
    const result = await call('get_list', { list: 'https://onmangekoi.test/fr/lists/7K3M9P2QWX' })
    expect(mocks.getListByParam).toHaveBeenCalledWith(expect.anything(), '7K3M9P2QWX')
    expect(result.structuredContent).toMatchObject({
      restaurantCount: 1,
      restaurants: [{ id: R1 }],
    })
    expect(JSON.stringify(result)).not.toContain(OTHER_ID)
  })

  it("refuse la liste d'un autre", async () => {
    mocks.getListByParam.mockResolvedValue(list({ owner_id: OTHER_ID }))
    const result = await call('get_list', { list: '7K3M9P2QWX' })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining('list_not_found') })
  })
})

describe('create_list', () => {
  it('crée la liste, revalide `/lists` et rend ses liens', async () => {
    mocks.createListUseCase.mockResolvedValue(list() as List)
    const result = await call('create_list', { name: '  Près du bureau ', restaurantIds: [R1, R1] })
    expect(mocks.createListUseCase).toHaveBeenCalledWith(expect.anything(), USER_ID, {
      name: 'Près du bureau',
      restaurantIds: [R1],
    })
    expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith('/lists')
    expect(result.structuredContent).toMatchObject({ code: '7K3M9P2QWX', restaurantCount: 1 })
  })

  it('accepte une liste vide, avec ou sans `null`', async () => {
    mocks.createListUseCase.mockResolvedValue(list() as List)
    const result = await call('create_list', { name: 'Vide', restaurantIds: null })
    expect(mocks.createListUseCase).toHaveBeenCalledWith(expect.anything(), USER_ID, {
      name: 'Vide',
      restaurantIds: [],
    })
    expect(result.structuredContent).toMatchObject({ restaurantCount: 0 })
  })

  it("ne crée rien quand un restaurant n'existe pas", async () => {
    mocks.getRestaurantsByIds.mockResolvedValue([restaurant(R1)])
    const result = await call('create_list', { name: 'Près du bureau', restaurantIds: [R1, R2] })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining('invalid_request') })
    expect(mocks.createListUseCase).not.toHaveBeenCalled()
    expect(mocks.revalidateLocalizedPath).not.toHaveBeenCalled()
  })
})

describe('add_restaurants_to_list / remove_restaurant_from_list', () => {
  it('ajoute et purge la page publique par revalidateTag', async () => {
    mocks.getListByParam.mockResolvedValue(list())
    const result = await call('add_restaurants_to_list', {
      list: '7K3M9P2QWX',
      restaurantIds: [R1, R2],
    })
    expect(mocks.addRestaurantsToList).toHaveBeenCalledWith(expect.anything(), LIST_ID, [R1, R2])
    expect(mocks.revalidateTag).toHaveBeenCalledWith('public-list:7K3M9P2QWX', { expire: 0 })
    expect(mocks.updateTag).not.toHaveBeenCalled()
    expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith('/lists/[code]', 'page')
    expect(result.structuredContent).toMatchObject({ restaurantCount: 2 })
  })

  it("n'ajoute rien quand un restaurant n'existe pas", async () => {
    mocks.getListByParam.mockResolvedValue(list())
    mocks.getRestaurantsByIds.mockResolvedValue([])
    const result = await call('add_restaurants_to_list', {
      list: '7K3M9P2QWX',
      restaurantIds: [R2],
    })
    expect(result.isError).toBe(true)
    expect(mocks.addRestaurantsToList).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("n'écrit pas dans la liste d'un autre", async () => {
    mocks.getListByParam.mockResolvedValue(null)
    const result = await call('remove_restaurant_from_list', {
      list: '7K3M9P2QWX',
      restaurantId: R1,
    })
    expect(result.isError).toBe(true)
    expect(mocks.removeRestaurantFromList).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it('retire et purge', async () => {
    mocks.getListByParam.mockResolvedValue(list())
    const result = await call('remove_restaurant_from_list', {
      list: '7K3M9P2QWX',
      restaurantId: R1,
    })
    expect(mocks.removeRestaurantFromList).toHaveBeenCalledWith(expect.anything(), LIST_ID, R1)
    expect(mocks.revalidateTag).toHaveBeenCalledWith('public-list:7K3M9P2QWX', { expire: 0 })
    expect(result.structuredContent).toMatchObject({ restaurantCount: 0 })
  })
})

describe('get_shared_list', () => {
  it('ouvre une liste partagée par lien, pseudo du propriétaire seulement', async () => {
    mocks.getSharedListPreview.mockResolvedValue({
      id: LIST_ID,
      name: 'Les restos de Sam',
      owner_pseudo: 'Sam',
      share_code: '7K3M9P2QWX',
      is_public: false,
      is_collaborative: true,
      restaurant_count: 1,
    })
    mocks.getSharedListRestaurants.mockResolvedValue([restaurant(R1)])
    mocks.ownsSharedList.mockResolvedValue(false)

    const result = await call('get_shared_list', { list: 'https://onmangekoi.test/l/7k3m9p2qwx' })

    expect(mocks.getSharedListPreview).toHaveBeenCalledWith(expect.anything(), '7K3M9P2QWX')
    expect(result.structuredContent).toMatchObject({
      ownerPseudo: 'Sam',
      isMine: false,
      isCollaborative: true,
      shareUrl: 'https://onmangekoi.test/l/7K3M9P2QWX',
    })
    expect(JSON.stringify(result)).not.toContain(LIST_ID)
  })

  it('retombe sur la vitrine publique', async () => {
    mocks.getSharedListPreview.mockResolvedValue(null)
    mocks.getSharedListRestaurants.mockResolvedValue([])
    mocks.ownsSharedList.mockResolvedValue(false)
    mocks.getPublicList.mockResolvedValue({
      name: 'Top Paris',
      share_code: '7K3M9P2QWX',
      restaurant_count: 1,
      cuisines: [],
      top_restaurant: null,
      top_restaurant_wins: null,
      updated_at: '2026-10-02T12:00:00Z',
    })
    mocks.getPublicListRestaurants.mockResolvedValue([restaurant(R2)])

    const result = await call('get_shared_list', { list: '7K3M9P2QWX' })

    expect(result.structuredContent).toMatchObject({
      name: 'Top Paris',
      ownerPseudo: null,
      isPublic: true,
      isCollaborative: null,
      restaurants: [{ id: R2 }],
    })
  })

  it('refuse un lien illisible', async () => {
    const result = await call('get_shared_list', { list: 'pas-un-code' })
    expect(result.isError).toBe(true)
    expect(mocks.getSharedListPreview).not.toHaveBeenCalled()
  })
})
