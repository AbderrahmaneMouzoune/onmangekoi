import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Le marqueur `server-only` refuse d'être importé hors Server Component ; sous
// Vitest on le neutralise, comme le fait Next avec la condition `react-server`.
vi.mock('server-only', () => ({}))

/**
 * Vérification du captcha : `fetch` est bouchonné, aucun appel ne sort. On
 * vérifie ce qui compte — l'interrupteur par variables d'environnement, le
 * secret qui part bien à Cloudflare et nulle part ailleurs, et le fait qu'une
 * panne de Cloudflare ne ferme pas l'onboarding.
 */

const SITE_KEY = '1x00000000000000000000AA'
const SECRET = '1x0000000000000000000000000000000AA'

const fetchMock = vi.fn()

/** `env` est figée à l'import : on recharge le module à chaque test. */
async function importTurnstile() {
  vi.resetModules()
  return import('./turnstile')
}

function enable() {
  process.env.TURNSTILE_SECRET_KEY = SECRET
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = SITE_KEY
}

describe('data-access/turnstile', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    enable()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.TURNSTILE_SECRET_KEY
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  })

  it('should stay disabled — and silent — when either key is missing', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    const { isTurnstileEnabled, verifyTurnstile } = await importTurnstile()

    expect(isTurnstileEnabled()).toBe(false)
    expect(await verifyTurnstile(null)).toBe('ok')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should send the secret to Cloudflare and accept a valid token', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    const { isTurnstileEnabled, verifyTurnstile } = await importTurnstile()

    expect(isTurnstileEnabled()).toBe(true)
    expect(await verifyTurnstile('a-token')).toBe('ok')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    const body = new URLSearchParams(init.body as URLSearchParams)
    expect(body.get('secret')).toBe(SECRET)
    expect(body.get('response')).toBe('a-token')
  })

  it('should refuse a token Cloudflare rejects', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    })
    const { verifyTurnstile } = await importTurnstile()

    expect(await verifyTurnstile('forged')).toBe('rejected')
  })

  it('should tell an absent token apart from a refused one', async () => {
    const { verifyTurnstile } = await importTurnstile()

    // Le widget n'a pas encore répondu : c'est réessayable, pas un échec.
    expect(await verifyTurnstile(null)).toBe('missing')
    expect(await verifyTurnstile('')).toBe('missing')
    // Un jeton hors gabarit ne mérite pas un appel réseau.
    expect(await verifyTurnstile('x'.repeat(2049))).toBe('rejected')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should let people in when Cloudflare is unreachable, and say so', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const { verifyTurnstile } = await importTurnstile()

    expect(await verifyTurnstile('a-token')).toBe('ok')
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[turnstile]'))
  })

  it('should let people in when siteverify answers an error status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    const { verifyTurnstile } = await importTurnstile()

    expect(await verifyTurnstile('a-token')).toBe('ok')
  })
})
