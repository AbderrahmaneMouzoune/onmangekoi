import { describe, expect, it } from 'vitest'

import { router } from '@/config/router.config'
import { isProtectedPath, needsSessionRefresh, sanitizeNextPath } from '@/lib/routing'

import {
  consentDecisionSchema,
  isConsentRedirect,
  readAuthorizationId,
  redirectTarget,
  safeHttpUrl,
  toConnectedApp,
  toConnectedApps,
} from './oauth'

import type { OAuthGrant } from '@supabase/supabase-js'

function grant(overrides: Partial<OAuthGrant['client']> = {}, extra: Partial<OAuthGrant> = {}) {
  return {
    client: {
      id: 'c1',
      name: 'Claude',
      uri: 'https://claude.ai',
      logo_uri: '',
      ...overrides,
    },
    scopes: ['openid', 'email'],
    granted_at: '2026-10-01T10:00:00Z',
    ...extra,
  } satisfies OAuthGrant
}

describe('consent route', () => {
  it('should protect the consent page and refresh the session there', () => {
    expect(isProtectedPath('/oauth/consent')).toBe(true)
    expect(needsSessionRefresh('/oauth/consent')).toBe(true)
  })

  it('should carry the authorization id through the onboarding and back', () => {
    // Le proxy renvoie vers `/setup?next=<chemin + query>` : l'onboarding doit
    // y ramener avec `authorization_id` intact.
    const consent = router.oauthConsent('abc-123/=+')
    expect(consent).toBe('/oauth/consent?authorization_id=abc-123%2F%3D%2B')
    const next = new URL(router.setup(consent), 'https://x.test').searchParams.get('next')
    expect(sanitizeNextPath(next)).toBe(consent)
  })
})

describe('readAuthorizationId', () => {
  it('should read a single or repeated parameter', () => {
    expect(readAuthorizationId('abc')).toBe('abc')
    expect(readAuthorizationId([' abc ', 'def'])).toBe('abc')
  })

  it('should reject a missing, blank or oversized one', () => {
    expect(readAuthorizationId(undefined)).toBeNull()
    expect(readAuthorizationId('   ')).toBeNull()
    expect(readAuthorizationId('a'.repeat(300))).toBeNull()
  })
})

describe('consentDecisionSchema', () => {
  it('should accept only the two decisions', () => {
    expect(
      consentDecisionSchema.safeParse({ authorization_id: 'a', decision: 'deny' }).success
    ).toBe(true)
    expect(
      consentDecisionSchema.safeParse({ authorization_id: 'a', decision: 'false' }).success
    ).toBe(false)
    expect(
      consentDecisionSchema.safeParse({ authorization_id: '', decision: 'approve' }).success
    ).toBe(false)
  })
})

describe('isConsentRedirect', () => {
  it('should tell an already granted request from one awaiting consent', () => {
    expect(isConsentRedirect({ redirect_url: 'https://claude.ai/cb?code=x' })).toBe(true)
    expect(
      isConsentRedirect({
        authorization_id: 'a',
        redirect_uri: 'https://claude.ai/cb',
        client: grant().client,
        user: { id: 'u', email: '' },
        scope: 'openid',
      })
    ).toBe(false)
  })
})

describe('safeHttpUrl', () => {
  it('should keep http(s) URLs only', () => {
    expect(safeHttpUrl('https://claude.ai/x')?.host).toBe('claude.ai')
    expect(safeHttpUrl('http://localhost:3000')?.host).toBe('localhost:3000')
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('data:image/png;base64,AAAA')).toBeNull()
    expect(safeHttpUrl('not a url')).toBeNull()
    expect(safeHttpUrl('')).toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
  })
})

describe('redirectTarget', () => {
  it('should show where the authorization code will be sent', () => {
    expect(redirectTarget('https://claude.ai/api/mcp/auth_callback?x=1')).toBe('claude.ai')
    expect(redirectTarget('http://127.0.0.1:6274/oauth/callback')).toBe('127.0.0.1:6274')
    expect(redirectTarget('cursor://anysphere.cursor-mcp/oauth/callback')).toBe(
      'cursor://anysphere.cursor-mcp'
    )
    expect(redirectTarget('com.example.app:/callback')).toBe('com.example.app:')
  })

  it('should give nothing for a missing or unreadable URI', () => {
    expect(redirectTarget('')).toBeNull()
    expect(redirectTarget(undefined)).toBeNull()
    expect(redirectTarget('not a url')).toBeNull()
  })
})

describe('toConnectedApp', () => {
  it('should keep only what the account page shows', () => {
    expect(toConnectedApp(grant())).toEqual({
      clientId: 'c1',
      name: 'Claude',
      host: 'claude.ai',
      scopes: ['openid', 'email'],
      grantedAt: '2026-10-01T10:00:00Z',
    })
  })

  it('should fall back when the client declared no name or an unsafe site', () => {
    const app = toConnectedApp(grant({ name: '  ', uri: 'javascript:alert(1)' }))
    expect(app.name).toBeNull()
    expect(app.host).toBeNull()
  })

  it('should drop duplicate and empty scopes', () => {
    expect(toConnectedApp(grant({}, { scopes: ['openid', 'openid', ''] })).scopes).toEqual([
      'openid',
    ])
  })

  it('should list the most recently granted app first', () => {
    const apps = toConnectedApps([
      grant({ id: 'old' }, { granted_at: '2026-01-01T00:00:00Z' }),
      grant({ id: 'new' }, { granted_at: '2026-06-01T00:00:00Z' }),
    ])
    expect(apps.map((app) => app.clientId)).toEqual(['new', 'old'])
  })
})
