import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { McpList } from '@/data-access/mcp'
import type { Restaurant } from '@/data-access/models'
import type { AuthInfo, CallToolResult, McpServer } from '@modelcontextprotocol/server'

vi.mock('server-only', () => ({}))

/**
 * Tools des listes. L'accès aux données est bouchonné : on vérifie qu'une
 * liste s'adresse par id, code ou lien, que les RPC `mcp_*` reçoivent le
 * jeton personnel — ou rien en OAuth —, qu'aucun `owner_id` ni jeton ne
 * sort, que « j'ai mangé à… » rend une forme stable, et que les écritures
 * purgent la page publique par `revalidateTag` — jamais `updateTag`, qui
 * lève dans un route handler.
 */

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  revalidateLocalizedPath: vi.fn(),
  mcpLists: vi.fn(),
  mcpList: vi.fn(),
  mcpCreateList: vi.fn(),
  mcpAddToList: vi.fn(),
  mcpRemoveFromList: vi.fn(),
  mcpFindRestaurants: vi.fn(),
  getSharedListPreview: vi.fn(),
  getSharedListRestaurants: vi.fn(),
  ownsSharedList: vi.fn(),
  getPublicList: vi.fn(),
  getPublicListRestaurants: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag, updateTag: mocks.updateTag }))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'fr',
  getTranslations: async () => (key: string) =>
    key === 'defaultListName' ? 'Mes bonnes adresses' : key,
}))
vi.mock('@/i18n/server', () => ({
  translateError: async (error: unknown) =>
    error instanceof Error ? error.message.replace(/^omk:/, '') : 'error',
  revalidateLocalizedPath: mocks.revalidateLocalizedPath,
}))
vi.mock('@/data-access/restaurants', () => ({}))
vi.mock('@/data-access/suggestions', () => ({}))
vi.mock('@/data-access/recent-winners', () => ({}))
vi.mock('@/data-access/public-results', () => ({}))
vi.mock('@/data-access/places', () => ({ isPlacesSearchEnabled: () => false }))
vi.mock('@/data-access/mcp', () => ({
  mcpLists: mocks.mcpLists,
  mcpList: mocks.mcpList,
  mcpCreateList: mocks.mcpCreateList,
  mcpAddToList: mocks.mcpAddToList,
  mcpRemoveFromList: mocks.mcpRemoveFromList,
  mcpFindRestaurants: mocks.mcpFindRestaurants,
}))
vi.mock('@/data-access/lists', () => ({
  getSharedListPreview: mocks.getSharedListPreview,
  getSharedListRestaurants: mocks.getSharedListRestaurants,
  ownsSharedList: mocks.ownsSharedList,
}))
vi.mock('@/data-access/public-lists', () => ({
  getPublicList: mocks.getPublicList,
  getPublicListRestaurants: mocks.getPublicListRestaurants,
  publicListCacheTag: (code: string) => `public-list:${code}`,
}))

const { registerListTools, toListSummary } = await import('./lists')

const USER_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const OTHER_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
const LIST_ID = '1c6b1a4e-58f1-4b8d-9e0a-6a2e3f5d7c11'
const R1 = '3b241101-e2bb-4255-8caf-4136c566a962'
const R2 = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b'
const PERSONAL_TOKEN = `omk_${'c'.repeat(48)}`

const AUTH: AuthInfo = {
  token: 'token',
  clientId: 'client',
  scopes: [],
  extra: { caller: { mode: 'oauth', userId: USER_ID, isAnonymous: false, clientId: 'client' } },
}

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
  registerListTools(server)
  return tools
}

async function call(name: string, args: unknown, authInfo: AuthInfo = AUTH) {
  const tool = registerAll().get(name)
  if (!tool) throw new Error(`unknown tool ${name}`)
  const result = await tool.cb(tool.config.inputSchema.parse(args), { http: { authInfo } })
  if (!result.isError) tool.config.outputSchema.parse(result.structuredContent)
  return result
}

/** Les RPC `mcp_*` ont reçu le jeton personnel. */
const withToken = expect.objectContaining({ token: PERSONAL_TOKEN })

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

function mcpList(overrides: Partial<McpList> = {}): McpList {
  return {
    id: LIST_ID,
    name: 'Près du bureau',
    share_code: '7K3M9P2QWX',
    is_public: false,
    is_collaborative: false,
    restaurant_count: 1,
    updated_at: '2026-10-02T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.mcpLists.mockResolvedValue([mcpList()])
})

describe('toListSummary', () => {
  it('rend id, code et liens absolus', () => {
    expect(toListSummary(mcpList())).toEqual({
      id: LIST_ID,
      code: '7K3M9P2QWX',
      name: 'Près du bureau',
      restaurantCount: 1,
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

  it('annotent honnêtement lectures et écritures', () => {
    const tools = registerAll()
    expect(tools.get('my_lists')!.config.annotations.readOnlyHint).toBe(true)
    expect(tools.get('remove_from_list')!.config.annotations.destructiveHint).toBe(true)
    expect(tools.get('add_to_list')!.config.annotations.destructiveHint).toBe(false)
    expect(tools.get('remember_restaurant')!.config.annotations.readOnlyHint).toBe(false)
    // Sans Google configuré, « j'ai mangé à… » reste dans l'app.
    expect(tools.get('remember_restaurant')!.config.annotations.openWorldHint).toBe(false)
  })
})

describe('my_lists', () => {
  it('lit les listes du porteur du jeton', async () => {
    const result = await call('my_lists', {}, TOKEN_AUTH)
    expect(mocks.mcpLists).toHaveBeenCalledWith(withToken)
    expect(result.structuredContent).toMatchObject({ lists: [{ id: LIST_ID, code: '7K3M9P2QWX' }] })
  })

  it("passe un jeton nul en OAuth : la base s'en tient à auth.uid()", async () => {
    await call('my_lists', {})
    expect(mocks.mcpLists).toHaveBeenCalledWith(expect.objectContaining({ token: null }))
  })
})

describe('get_list', () => {
  it('accepte un id sans chercher parmi les listes', async () => {
    mocks.mcpList.mockResolvedValue({ ...mcpList(), restaurants: [{ id: R1, name: 'Sushi' }] })
    const result = await call('get_list', { list: LIST_ID }, TOKEN_AUTH)
    expect(mocks.mcpLists).not.toHaveBeenCalled()
    expect(mocks.mcpList).toHaveBeenCalledWith(withToken, LIST_ID)
    expect(result.structuredContent).toMatchObject({
      id: LIST_ID,
      restaurants: [{ id: R1, name: 'Sushi', tags: [] }],
    })
  })

  it('retrouve une liste par le lien collé', async () => {
    mocks.mcpList.mockResolvedValue({ ...mcpList(), restaurants: [] })
    await call('get_list', { list: 'https://onmangekoi.test/lists/7k3m9p2qwx' })
    expect(mocks.mcpList).toHaveBeenCalledWith(expect.anything(), LIST_ID)
  })

  it('refuse un code qui ne désigne aucune de ses listes', async () => {
    const result = await call('get_list', { list: 'ZZZZZZZZZZ' })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining('list_not_found') })
    expect(mocks.mcpList).not.toHaveBeenCalled()
  })
})

describe('create_list', () => {
  it('crée la liste, revalide `/lists` et rend ses liens', async () => {
    mocks.mcpCreateList.mockResolvedValue(mcpList({ name: 'Brunchs', restaurant_count: 0 }))
    const result = await call('create_list', { name: ' Brunchs ' }, TOKEN_AUTH)
    expect(mocks.mcpCreateList).toHaveBeenCalledWith(withToken, 'Brunchs')
    expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith('/lists')
    expect(result.structuredContent).toMatchObject({ name: 'Brunchs', restaurantCount: 0 })
  })
})

describe('add_to_list / remove_from_list', () => {
  it('ajoute et purge la page publique par revalidateTag', async () => {
    mocks.mcpAddToList.mockResolvedValue({
      added: true,
      already_in_list: false,
      list: mcpList({ restaurant_count: 2 }),
      restaurant: { id: R2, name: 'La Ba', source: 'manual' },
    })
    const result = await call('add_to_list', { list: '7K3M9P2QWX', restaurantId: R2 }, TOKEN_AUTH)

    expect(mocks.mcpAddToList).toHaveBeenCalledWith(withToken, LIST_ID, R2)
    expect(mocks.revalidateTag).toHaveBeenCalledWith('public-list:7K3M9P2QWX', { expire: 0 })
    expect(mocks.updateTag).not.toHaveBeenCalled()
    expect(result.structuredContent).toMatchObject({
      added: true,
      alreadyInList: false,
      list: { restaurantCount: 2 },
      restaurant: { id: R2 },
    })
    expect(JSON.stringify(result)).not.toContain('manual')
  })

  it('ne purge rien quand le resto y était déjà', async () => {
    mocks.mcpAddToList.mockResolvedValue({
      added: false,
      already_in_list: true,
      list: mcpList(),
      restaurant: { id: R1, name: 'Sushi' },
    })
    await call('add_to_list', { list: LIST_ID, restaurantId: R1 })
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it('retire et purge', async () => {
    mocks.mcpRemoveFromList.mockResolvedValue({
      removed: true,
      list: mcpList({ restaurant_count: 0 }),
    })
    const result = await call('remove_from_list', { list: LIST_ID, restaurantId: R1 }, TOKEN_AUTH)
    expect(mocks.mcpRemoveFromList).toHaveBeenCalledWith(withToken, LIST_ID, R1)
    expect(mocks.revalidateTag).toHaveBeenCalledWith('public-list:7K3M9P2QWX', { expire: 0 })
    expect(result.structuredContent).toMatchObject({ removed: true, list: { restaurantCount: 0 } })
  })
})

describe('remember_restaurant', () => {
  it('range un resto connu dans la seule liste et purge sa page', async () => {
    mocks.mcpFindRestaurants.mockResolvedValue([
      { id: R1, name: 'La Ba', city: 'Paris', in_my_lists: [] },
    ])
    mocks.mcpAddToList.mockResolvedValue({
      added: true,
      already_in_list: false,
      list: mcpList({ restaurant_count: 2 }),
      restaurant: { id: R1, name: 'La Ba', city: 'Paris' },
    })

    const result = await call('remember_restaurant', { name: 'la ba' }, TOKEN_AUTH)

    expect(mocks.mcpAddToList).toHaveBeenCalledWith(withToken, LIST_ID, R1)
    expect(mocks.revalidateTag).toHaveBeenCalledWith('public-list:7K3M9P2QWX', { expire: 0 })
    expect(result.structuredContent).toMatchObject({
      status: 'added',
      restaurantSource: 'catalog',
      listCreated: false,
      list: { id: LIST_ID, shareUrl: 'https://onmangekoi.test/l/7K3M9P2QWX' },
      restaurant: { id: R1, city: 'Paris' },
    })
  })

  it('crée la liste par défaut, dans la langue de la requête', async () => {
    mocks.mcpLists.mockResolvedValue([])
    mocks.mcpFindRestaurants.mockResolvedValue([{ id: R1, name: 'La Ba', in_my_lists: [] }])
    mocks.mcpCreateList.mockResolvedValue(mcpList({ name: 'Mes bonnes adresses' }))
    mocks.mcpAddToList.mockResolvedValue({
      added: true,
      already_in_list: false,
      list: mcpList({ name: 'Mes bonnes adresses' }),
      restaurant: { id: R1, name: 'La Ba' },
    })

    const result = await call('remember_restaurant', { name: 'La Ba' })

    expect(mocks.mcpCreateList).toHaveBeenCalledWith(expect.anything(), 'Mes bonnes adresses')
    expect(result.structuredContent).toMatchObject({ status: 'added', listCreated: true })
  })

  it('ne fait rien en cas de doute et rend les candidats', async () => {
    mocks.mcpFindRestaurants.mockResolvedValue([
      { id: R1, name: 'La Baraka', in_my_lists: [] },
      { id: R2, name: 'La Bastide', in_my_lists: [{ id: LIST_ID, name: 'Près du bureau' }] },
    ])

    const result = await call('remember_restaurant', { name: 'la ba' })

    expect(mocks.mcpAddToList).not.toHaveBeenCalled()
    expect(mocks.mcpCreateList).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(result.structuredContent).toMatchObject({
      status: 'ambiguous',
      catalogCandidates: [{ id: R1 }, { id: R2, in_my_lists: [{ id: LIST_ID }] }],
      googleCandidates: [],
    })
  })

  it('demande la liste quand il y en a plusieurs', async () => {
    mocks.mcpLists.mockResolvedValue([mcpList(), mcpList({ id: R2, name: 'Le soir' })])
    mocks.mcpFindRestaurants.mockResolvedValue([{ id: R1, name: 'La Ba', in_my_lists: [] }])

    const result = await call('remember_restaurant', { name: 'La Ba' })

    expect(mocks.mcpAddToList).not.toHaveBeenCalled()
    expect(result.structuredContent).toMatchObject({
      status: 'choose_list',
      lists: [{ id: LIST_ID }, { id: R2, name: 'Le soir' }],
    })
  })

  it('range dans la liste désignée par son code', async () => {
    mocks.mcpLists.mockResolvedValue([mcpList(), mcpList({ id: R2, share_code: 'ABCDEFGHJK' })])
    mocks.mcpFindRestaurants.mockResolvedValue([{ id: R1, name: 'La Ba', in_my_lists: [] }])
    mocks.mcpAddToList.mockResolvedValue({
      added: true,
      already_in_list: false,
      list: mcpList({ id: R2, share_code: 'ABCDEFGHJK' }),
      restaurant: { id: R1, name: 'La Ba' },
    })

    await call('remember_restaurant', { name: 'La Ba', list: 'ABCDEFGHJK' })

    expect(mocks.mcpAddToList).toHaveBeenCalledWith(expect.anything(), R2, R1)
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

  it('exige OAuth : la lecture se fait avec les droits de l’utilisateur', async () => {
    const result = await call('get_shared_list', { list: '7K3M9P2QWX' }, TOKEN_AUTH)
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ text: expect.stringMatching(/^requires_oauth:/) })
    expect(mocks.getSharedListPreview).not.toHaveBeenCalled()
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
