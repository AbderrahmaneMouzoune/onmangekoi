import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

/**
 * Câblage des tools de session : la couche d'accès aux données, les use cases
 * et les revalidations sont bouchonnés. On vérifie ce que le tool ajoute —
 * résolution des identifiants, refus avant écriture, revalidations rejouées
 * depuis les Server Actions, forme de la sortie — et les annotations.
 */

const USER = '0f8fad5b-d9cb-469f-a165-70867728950e'
const RESTAURANT = '1b4e28ba-2fa1-11d2-883f-0016d3cca427'
const LIST = 'c56a4180-65aa-42ec-a945-5fd21dec0538'
const SESSION_RESTAURANT = 'a3bb189e-8bf9-3888-9912-ace4e6543002'

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  revalidateLocalizedPath: vi.fn(),
  getSessionByParam: vi.fn(),
  getListByParam: vi.fn(),
  addSessionRestaurants: vi.fn(),
  setResultsPublic: vi.fn(),
  createSessionUseCase: vi.fn(),
  submitVoteUseCase: vi.fn(),
  count: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }))
vi.mock('@/i18n/server', () => ({ revalidateLocalizedPath: mocks.revalidateLocalizedPath }))
vi.mock('@/data-access/public-results', () => ({
  PUBLIC_RESULTS_CACHE_PROFILE: 'hours',
  publicResultsCacheTag: (code: string) => `public-results:${code}`,
}))
vi.mock('@/data-access/lists', () => ({ getListByParam: mocks.getListByParam }))
vi.mock('@/data-access/food-constraints', () => ({ getSessionConstraintConflicts: vi.fn() }))
vi.mock('@/data-access/votes', () => ({ getMyVotes: vi.fn() }))
vi.mock('@/data-access/sessions', () => ({
  addSessionRestaurants: mocks.addSessionRestaurants,
  closeSession: vi.fn(),
  confirmDecision: vi.fn(),
  getRunoffSession: vi.fn(),
  getSessionByParam: mocks.getSessionByParam,
  getSessionParticipants: vi.fn(),
  getSessionRestaurants: vi.fn(),
  getSessionResults: vi.fn(),
  launchSession: vi.fn(),
  setResultsPublic: mocks.setResultsPublic,
}))
vi.mock('@/use-cases/create-session', () => ({ createSessionUseCase: mocks.createSessionUseCase }))
vi.mock('@/use-cases/join-session', () => ({ joinSessionUseCase: vi.fn() }))
vi.mock('@/use-cases/start-session-from-list', () => ({ startSessionFromListUseCase: vi.fn() }))
vi.mock('@/use-cases/submit-vote', () => ({ submitVoteUseCase: mocks.submitVoteUseCase }))

/** Client Supabase réduit au compte des restaurants d'une session. */
const supabase = {
  from: () => ({
    select: () => ({ eq: async () => ({ count: mocks.count(), error: null }) }),
  }),
}

/**
 * `runTool` bouchonné : un appelant fixe, et la sortie (ou le refus) rendue
 * telle quelle pour l'inspecter sans passer par la traduction.
 */
vi.mock('@/lib/mcp/context', () => ({
  runTool: async (
    _authInfo: unknown,
    body: (context: { caller: { userId: string }; supabase: unknown }) => Promise<unknown>
  ) => {
    try {
      return { ok: true, output: await body({ caller: { userId: USER }, supabase }) }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  },
}))

const { registerSessionTools } = await import('./sessions')

type Registered = {
  config: { annotations: Record<string, boolean>; inputSchema: { parse: (v: unknown) => unknown } }
  handler: (args: unknown, ctx: unknown) => Promise<{ ok: boolean; output?: any; error?: string }>
}

const tools = new Map<string, Registered>()
registerSessionTools({
  registerTool: (name: string, config: Registered['config'], handler: Registered['handler']) => {
    tools.set(name, { config, handler })
  },
} as never)

function call(name: string, args: Record<string, unknown>) {
  const tool = tools.get(name)
  if (!tool) throw new Error(`unknown tool ${name}`)
  return tool.handler(tool.config.inputSchema.parse(args), { http: { authInfo: {} } })
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b3bb189e-8bf9-3888-9912-ace4e6543002',
    name: 'Déjeuner',
    status: 'waiting',
    invite_code: '7K3M9P',
    results_code: 'RESULTS0001',
    results_public: false,
    host_id: USER,
    rules: {},
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.count.mockReturnValue(3)
})

describe('registerSessionTools', () => {
  it('should register every session tool', () => {
    expect([...tools.keys()].sort()).toEqual(
      [
        'add_restaurants_to_session',
        'close_session',
        'confirm_decision',
        'create_session',
        'get_results',
        'get_session',
        'join_session',
        'launch_session',
        'set_results_public',
        'start_session_from_list',
        'vote',
      ].sort()
    )
  })

  it('should flag reads as read-only and engaging actions as destructive', () => {
    for (const name of ['get_session', 'get_results']) {
      expect(tools.get(name)?.config.annotations.readOnlyHint).toBe(true)
    }
    for (const name of [
      'vote',
      'launch_session',
      'close_session',
      'confirm_decision',
      'set_results_public',
    ]) {
      expect(tools.get(name)?.config.annotations.destructiveHint).toBe(true)
    }
    for (const tool of tools.values()) expect(tool.config.annotations.openWorldHint).toBe(false)
  })
})

describe('create_session', () => {
  it('should resolve my list codes, create the session and revalidate home', async () => {
    mocks.getListByParam.mockResolvedValue({ id: LIST, owner_id: USER })
    mocks.createSessionUseCase.mockResolvedValue(session())

    const result = await call('create_session', {
      name: 'Midi',
      lists: ['https://onmangekoi.fr/lists/7K3M9P2QWX'],
      restaurantIds: [RESTAURANT],
      open: false,
    })

    expect(mocks.getListByParam).toHaveBeenCalledWith(supabase, '7K3M9P2QWX')
    expect(mocks.createSessionUseCase).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ listIds: [LIST], restaurantIds: [RESTAURANT], open: false })
    )
    expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith('/')
    expect(result.output).toMatchObject({
      invite_code: '7K3M9P',
      status: 'waiting',
      restaurant_count: 3,
      invite_url: 'https://onmangekoi.test/join/7K3M9P',
    })
    expect(result.output.next_step).toContain('launch_session')
  })

  it("should refuse someone else's list", async () => {
    mocks.getListByParam.mockResolvedValue({ id: LIST, owner_id: 'someone-else' })
    const result = await call('create_session', { name: 'Midi', lists: ['7K3M9P2QWX'] })
    expect(result).toEqual({ ok: false, error: 'omk:list_not_found' })
    expect(mocks.createSessionUseCase).not.toHaveBeenCalled()
  })

  it('should replay the cross-field rules of the form', async () => {
    const result = await call('create_session', {
      name: 'Midi',
      restaurantIds: [RESTAURANT],
      open: true,
    })
    expect(result).toEqual({ ok: false, error: 'omk:open_session_needs_deadline' })
    expect(mocks.createSessionUseCase).not.toHaveBeenCalled()
  })
})

describe('add_restaurants_to_session', () => {
  it('should refuse once voting has started, before writing', async () => {
    mocks.getSessionByParam.mockResolvedValue(session({ status: 'voting' }))
    const result = await call('add_restaurants_to_session', {
      session: '7K3M9P',
      restaurantIds: [RESTAURANT],
    })
    expect(result).toEqual({ ok: false, error: 'omk:session_already_started' })
    expect(mocks.addSessionRestaurants).not.toHaveBeenCalled()
  })

  it('should refuse a closed session with the code the database uses', async () => {
    mocks.getSessionByParam.mockResolvedValue(session({ status: 'closed' }))
    const result = await call('add_restaurants_to_session', {
      session: '7K3M9P',
      restaurantIds: [RESTAURANT],
    })
    expect(result).toEqual({ ok: false, error: 'omk:session_closed' })
    expect(mocks.addSessionRestaurants).not.toHaveBeenCalled()
  })

  it('should add deduplicated restaurants and revalidate the session room', async () => {
    mocks.getSessionByParam.mockResolvedValue(session())
    mocks.count.mockReturnValueOnce(2).mockReturnValueOnce(3)
    const result = await call('add_restaurants_to_session', {
      session: '7K3M9P',
      restaurantIds: [RESTAURANT, RESTAURANT],
    })
    expect(mocks.addSessionRestaurants).toHaveBeenCalledWith(supabase, session().id, [RESTAURANT])
    expect(mocks.revalidateLocalizedPath).toHaveBeenCalledWith('/sessions/[code]', 'page')
    expect(result.output).toMatchObject({ added_count: 1, restaurant_count: 3 })
  })

  it('should count only restaurants that were not already in the session', async () => {
    mocks.getSessionByParam.mockResolvedValue(session())
    mocks.count.mockReturnValueOnce(3).mockReturnValueOnce(3)
    const result = await call('add_restaurants_to_session', {
      session: '7K3M9P',
      restaurantIds: [RESTAURANT],
    })
    expect(result.output).toMatchObject({ added_count: 0, restaurant_count: 3 })
  })
})

describe('vote', () => {
  it('should report an existing vote as already_voted', async () => {
    mocks.getSessionByParam.mockResolvedValue(session({ status: 'voting' }))
    mocks.submitVoteUseCase.mockResolvedValue({
      recorded: false,
      finished: false,
      skipped: true,
      agreed: false,
    })

    const result = await call('vote', {
      session: '7K3M9P',
      sessionRestaurantId: SESSION_RESTAURANT,
      value: 2,
    })

    expect(mocks.submitVoteUseCase).toHaveBeenCalledWith(supabase, USER, {
      sessionId: session().id,
      sessionRestaurantId: SESSION_RESTAURANT,
      value: 2,
    })
    expect(result.output).toEqual({
      recorded: false,
      already_voted: true,
      finished: false,
      agreed: false,
      session_url: 'https://onmangekoi.test/sessions/7K3M9P',
    })
  })

  it('should refuse a session that is not in voting, without voting', async () => {
    for (const status of ['waiting', 'closed']) {
      mocks.getSessionByParam.mockResolvedValue(session({ status }))
      const result = await call('vote', {
        session: '7K3M9P',
        sessionRestaurantId: SESSION_RESTAURANT,
        value: 1,
      })
      expect(result).toEqual({ ok: false, error: 'omk:session_not_voting' })
    }
    expect(mocks.submitVoteUseCase).not.toHaveBeenCalled()
  })

  it('should refuse an unknown session', async () => {
    mocks.getSessionByParam.mockResolvedValue(null)
    const result = await call('vote', {
      session: 'ZZZZZZ',
      sessionRestaurantId: SESSION_RESTAURANT,
      value: 1,
    })
    expect(result).toEqual({ ok: false, error: 'omk:session_not_found' })
  })
})

describe('set_results_public', () => {
  it('should purge the public ranking and return its link', async () => {
    mocks.getSessionByParam.mockResolvedValue(session({ status: 'closed' }))
    mocks.setResultsPublic.mockResolvedValue(session({ status: 'closed', results_public: true }))

    const result = await call('set_results_public', { session: '7K3M9P', public: true })

    expect(mocks.revalidateTag).toHaveBeenCalledWith('public-results:RESULTS0001', 'hours')
    expect(result.output).toEqual({
      invite_code: '7K3M9P',
      results_public: true,
      public_results_url: 'https://onmangekoi.test/r/RESULTS0001',
      results_url: 'https://onmangekoi.test/sessions/7K3M9P/results',
    })
  })
})
