import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

/**
 * Vérification des jetons du serveur MCP. `getClaims` (signature, expiration)
 * est bouchonné : on teste ce que l'app ajoute par-dessus — émetteur, rôle,
 * `client_id` obligatoire — et ce qu'elle transmet aux tools.
 */

const mocks = vi.hoisted(() => ({ getClaims: vi.fn() }))

vi.mock('@/data-access/supabase/public', () => ({
  createPublicClient: () => ({ auth: { getClaims: mocks.getClaims } }),
}))

const { authInfoFromClaims, authServerUrl, callerFromAuthInfo, verifyMcpToken } =
  await import('./auth')

const ISSUER = 'http://127.0.0.1:54321/auth/v1'

function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: ISSUER,
    sub: '0f8fad5b-d9cb-469f-a165-70867728950e',
    role: 'authenticated',
    client_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    scope: 'openid email',
    exp: 1_900_000_000,
    is_anonymous: true,
    ...overrides,
  }
}

describe('authServerUrl', () => {
  it('should point at the Supabase Auth server of the project', () => {
    expect(authServerUrl()).toBe(ISSUER)
  })
})

describe('authInfoFromClaims', () => {
  it('should accept an OAuth token issued by this project and expose the caller', () => {
    const info = authInfoFromClaims('token', claims())

    expect(info).toMatchObject({
      token: 'token',
      clientId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      scopes: ['openid', 'email'],
      expiresAt: 1_900_000_000,
    })
    expect(callerFromAuthInfo(info)).toEqual({
      userId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      isAnonymous: true,
      clientId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    })
  })

  it('should refuse a web session token, which carries no client_id', () => {
    expect(authInfoFromClaims('token', claims({ client_id: undefined }))).toBeUndefined()
  })

  it('should refuse a token issued by another project', () => {
    expect(
      authInfoFromClaims('token', claims({ iss: 'https://evil.supabase.co/auth/v1' }))
    ).toBeUndefined()
  })

  it('should refuse a token that is not an authenticated user', () => {
    expect(authInfoFromClaims('token', claims({ role: 'anon' }))).toBeUndefined()
    expect(authInfoFromClaims('token', claims({ sub: undefined }))).toBeUndefined()
  })
})

describe('verifyMcpToken', () => {
  beforeEach(() => mocks.getClaims.mockReset())

  it('should return nothing without a bearer token', async () => {
    expect(await verifyMcpToken(new Request('https://x'), undefined)).toBeUndefined()
    expect(mocks.getClaims).not.toHaveBeenCalled()
  })

  it('should return nothing when the signature check fails', async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new Error('invalid JWT') })
    expect(await verifyMcpToken(new Request('https://x'), 'bad')).toBeUndefined()
  })

  it('should return nothing when the token carries no claims', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null })
    expect(await verifyMcpToken(new Request('https://x'), 'bad')).toBeUndefined()
  })

  it('should return the auth info of a valid token', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: claims() }, error: null })
    const info = await verifyMcpToken(new Request('https://x'), 'good')
    expect(mocks.getClaims).toHaveBeenCalledWith('good')
    expect(callerFromAuthInfo(info)?.userId).toBe('0f8fad5b-d9cb-469f-a165-70867728950e')
  })
})
