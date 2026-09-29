import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Le marqueur `server-only` refuse d'être importé hors Server Component ; sous
// Vitest on le neutralise, comme le fait Next avec la condition `react-server`.
vi.mock('server-only', () => ({}))

/**
 * La route d'envoi, de bout en bout : secret, configuration, envoi, purge. La
 * base (`data-access/push`) et `web-push` sont bouchonnés — aucun appel ne
 * sort ; le cas d'usage, la construction du message et la lecture des
 * erreurs du service push sont les vrais.
 */

const mocks = vi.hoisted(() => {
  class WebPushError extends Error {
    constructor(
      message: string,
      readonly statusCode: number
    ) {
      super(message)
    }
  }
  return {
    WebPushError,
    sendNotification: vi.fn(),
    getPushSession: vi.fn(),
    getPushRecipients: vi.fn(),
    deletePushSubscriptions: vi.fn(),
    admin: { tag: 'admin' } as object | null,
  }
})

vi.mock('web-push', () => ({
  default: { sendNotification: mocks.sendNotification },
  WebPushError: mocks.WebPushError,
}))
vi.mock('@/data-access/supabase/admin', () => ({ createAdminClient: () => mocks.admin }))
vi.mock('@/data-access/push', () => ({
  getPushSession: mocks.getPushSession,
  getPushRecipients: mocks.getPushRecipients,
  deletePushSubscriptions: mocks.deletePushSubscriptions,
}))

const SECRET = 'un-secret-partage-assez-long'
const SESSION_ID = '3f1d2c4b-5a6e-4d7f-8a9b-0c1d2e3f4a5b'
const HOST_ID = '11111111-1111-4111-8111-111111111111'

const SESSION = { id: SESSION_ID, name: 'Midi de mardi', invite_code: '7K3M9P', status: 'voting' }
const ALIVE = { endpoint: 'https://push.example.test/alive', keys: { p256dh: 'a', auth: 'b' } }
const GONE = { endpoint: 'https://push.example.test/gone', keys: { p256dh: 'c', auth: 'd' } }
const MISSING = { endpoint: 'https://push.example.test/missing', keys: { p256dh: 'e', auth: 'f' } }
const BUSY = { endpoint: 'https://push.example.test/busy', keys: { p256dh: 'g', auth: 'h' } }

const VAPID = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BPublicKey',
  VAPID_PRIVATE_KEY: 'private-key',
  VAPID_SUBJECT: 'mailto:contact@onmangekoi.test',
}

/** `env` est figée à l'import : on recharge la route à chaque test. */
async function importRoute() {
  vi.resetModules()
  return import('./route')
}

function dispatch(body: unknown, authorization: string | null = `Bearer ${SECRET}`): Request {
  return new Request('https://onmangekoi.test/api/push/dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const LAUNCH = { session_id: SESSION_ID, status: 'voting', actor_id: HOST_ID }

describe('POST /api/push/dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin = { tag: 'admin' }
    process.env.PUSH_DISPATCH_SECRET = SECRET
    Object.assign(process.env, VAPID)
    mocks.getPushSession.mockResolvedValue(SESSION)
    mocks.getPushRecipients.mockResolvedValue([ALIVE])
    mocks.deletePushSubscriptions.mockResolvedValue(undefined)
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    delete process.env.PUSH_DISPATCH_SECRET
    for (const key of Object.keys(VAPID)) delete process.env[key]
    vi.restoreAllMocks()
  })

  it('should refuse a call without the shared secret, or with a wrong one', async () => {
    const { POST } = await importRoute()

    expect((await POST(dispatch(LAUNCH, null))).status).toBe(401)
    expect((await POST(dispatch(LAUNCH, 'Bearer mauvais-secret'))).status).toBe(401)
    expect((await POST(dispatch(LAUNCH, SECRET))).status).toBe(401)
    expect(mocks.getPushSession).not.toHaveBeenCalled()
  })

  it('should refuse every call when no secret is configured here', async () => {
    delete process.env.PUSH_DISPATCH_SECRET
    const { POST } = await importRoute()

    expect((await POST(dispatch(LAUNCH, 'Bearer undefined'))).status).toBe(401)
  })

  it('should reject a malformed body', async () => {
    const { POST } = await importRoute()

    expect((await POST(dispatch('pas du json{'))).status).toBe(400)
    expect((await POST(dispatch({ ...LAUNCH, status: 'waiting' }))).status).toBe(400)
    expect((await POST(dispatch({ ...LAUNCH, session_id: 'x' }))).status).toBe(400)
  })

  it('should accept and do nothing when VAPID is not configured', async () => {
    delete process.env.VAPID_PRIVATE_KEY
    const { POST } = await importRoute()

    const response = await POST(dispatch(LAUNCH))

    expect(response.status).toBe(204)
    expect(mocks.getPushSession).not.toHaveBeenCalled()
    expect(mocks.sendNotification).not.toHaveBeenCalled()
  })

  it('should accept and do nothing without the Supabase secret key', async () => {
    mocks.admin = null
    const { POST } = await importRoute()

    expect((await POST(dispatch(LAUNCH))).status).toBe(204)
    expect(mocks.sendNotification).not.toHaveBeenCalled()
  })

  it('should notify the participants but the author, with a link to the session', async () => {
    const { POST } = await importRoute()

    const response = await POST(dispatch(LAUNCH))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sent: 1, purged: 0, failed: 0 })
    expect(mocks.getPushRecipients).toHaveBeenCalledWith(mocks.admin, SESSION_ID, HOST_ID)

    const [subscription, payload, options] = mocks.sendNotification.mock.calls[0] ?? []
    expect(subscription).toEqual(ALIVE)
    expect(JSON.parse(payload)).toEqual({
      title: 'Le vote est lancé',
      body: 'Midi de mardi — à toi de voter.',
      url: '/sessions/7K3M9P',
      tag: `session-${SESSION_ID}`,
    })
    expect(options).toMatchObject({
      vapidDetails: {
        subject: VAPID.VAPID_SUBJECT,
        publicKey: VAPID.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        privateKey: VAPID.VAPID_PRIVATE_KEY,
      },
      TTL: 3600,
      urgency: 'high',
      topic: SESSION_ID.replace(/-/g, ''),
    })
  })

  it('should point a closing notification to the results', async () => {
    mocks.getPushSession.mockResolvedValue({ ...SESSION, status: 'closed' })
    const { POST } = await importRoute()

    await POST(dispatch({ session_id: SESSION_ID, status: 'closed', actor_id: null }))

    expect(mocks.getPushRecipients).toHaveBeenCalledWith(mocks.admin, SESSION_ID, null)
    const payload = JSON.parse(mocks.sendNotification.mock.calls[0]?.[1])
    expect(payload).toMatchObject({
      title: 'Le classement est prêt',
      url: '/sessions/7K3M9P/results',
    })
  })

  it('should purge the subscriptions the push service has forgotten (404, 410), and only those', async () => {
    mocks.getPushRecipients.mockResolvedValue([ALIVE, GONE, MISSING, BUSY])
    mocks.sendNotification.mockImplementation(async (subscription: typeof ALIVE) => {
      if (subscription === GONE) throw new mocks.WebPushError('Gone', 410)
      if (subscription === MISSING) throw new mocks.WebPushError('Not Found', 404)
      if (subscription === BUSY) throw new mocks.WebPushError('Too Many Requests', 429)
      return { statusCode: 201 }
    })
    const { POST } = await importRoute()

    const response = await POST(dispatch(LAUNCH))

    expect(await response.json()).toEqual({ sent: 1, purged: 2, failed: 1 })
    expect(mocks.deletePushSubscriptions).toHaveBeenCalledWith(mocks.admin, [
      GONE.endpoint,
      MISSING.endpoint,
    ])
  })

  it('should stay silent when the session has moved on since the call left', async () => {
    mocks.getPushSession.mockResolvedValue({ ...SESSION, status: 'closed' })
    const { POST } = await importRoute()

    const response = await POST(dispatch(LAUNCH))

    expect(await response.json()).toEqual({ sent: 0, purged: 0, failed: 0 })
    expect(mocks.sendNotification).not.toHaveBeenCalled()
  })
})
