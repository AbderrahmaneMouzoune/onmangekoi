import { describe, expect, it } from 'vitest'

import { OMK_MESSAGES, omkError, toUserMessage } from './errors'
import {
  linkedOAuthProviders,
  OAUTH_FAILURES,
  oauthDefaultNext,
  oauthFailureFromCallback,
  oauthFailureFromCode,
  oauthFailurePath,
  oauthSuccessPath,
  parseOAuthIntent,
  splitProviderList,
} from './oauth'

describe('oauthFailureFromCallback', () => {
  it('should treat a return without error as a success', () => {
    expect(oauthFailureFromCallback({})).toBeNull()
    expect(oauthFailureFromCallback({ error: null, error_code: null })).toBeNull()
  })

  it('should map an identity owned by another account to omk:identity_taken', () => {
    expect(
      oauthFailureFromCallback({
        error: 'server_error',
        error_code: 'identity_already_exists',
        error_description: 'Identity is already linked to another user',
      })
    ).toBe('identity_taken')
  })

  it('should map an email already used by another account to omk:identity_taken', () => {
    expect(oauthFailureFromCallback({ error: 'server_error', error_code: 'email_exists' })).toBe(
      'identity_taken'
    )
  })

  it('should fall back on the description when Auth sends no precise code', () => {
    expect(
      oauthFailureFromCallback({
        error: 'server_error',
        error_description: 'Identity is already linked to another user',
      })
    ).toBe('identity_taken')
  })

  it('should recognise a cancellation on the provider screen', () => {
    expect(oauthFailureFromCallback({ error: 'access_denied' })).toBe('oauth_cancelled')
  })

  it('should never leak an unknown error, only a generic failure', () => {
    expect(oauthFailureFromCallback({ error: 'server_error', error_description: 'pq: boom' })).toBe(
      'oauth_failed'
    )
  })
})

describe('oauthFailureFromCode', () => {
  it('should flag a provider or manual linking disabled on the project', () => {
    expect(oauthFailureFromCode('manual_linking_disabled')).toBe('oauth_unavailable')
    expect(oauthFailureFromCode('provider_disabled')).toBe('oauth_unavailable')
  })

  it('should default to a generic failure', () => {
    expect(oauthFailureFromCode(undefined)).toBe('oauth_failed')
    expect(oauthFailureFromCode('bad_code_verifier')).toBe('oauth_failed')
  })
})

describe('OAuth failures', () => {
  it('should all be translated business codes', () => {
    for (const failure of OAUTH_FAILURES) {
      expect(OMK_MESSAGES[failure]).toBeDefined()
      expect(toUserMessage(omkError(failure))).toBe(OMK_MESSAGES[failure])
    }
  })
})

describe('linkedOAuthProviders', () => {
  it('should keep only Google and Apple, in display order', () => {
    expect(linkedOAuthProviders(['email', 'apple', 'anonymous', 'google'])).toEqual([
      'google',
      'apple',
    ])
    expect(linkedOAuthProviders(undefined)).toEqual([])
  })
})

describe('splitProviderList', () => {
  it('should trim, lowercase and deduplicate', () => {
    expect(splitProviderList(' Apple,,google , APPLE ')).toEqual(['apple', 'google'])
    expect(splitProviderList(undefined)).toEqual([])
  })
})

describe('OAuth callback destinations', () => {
  it('should treat a missing or forged intent as a login', () => {
    expect(parseOAuthIntent('link')).toBe('link')
    expect(parseOAuthIntent(null)).toBe('login')
    expect(parseOAuthIntent('admin')).toBe('login')
  })

  it('should bring a failed link back to the account page with its reason', () => {
    const next = oauthDefaultNext('link')
    expect(next).toBe('/account')
    expect(oauthFailurePath('link', next, 'identity_taken')).toBe('/account?auth=identity_taken')
  })

  it('should bring a failed login back to /login, keeping the destination', () => {
    expect(oauthFailurePath('login', '/', 'oauth_cancelled')).toBe('/login?error=oauth_cancelled')
    expect(oauthFailurePath('login', '/lists', 'oauth_failed')).toBe(
      '/login?next=%2Flists&error=oauth_failed'
    )
  })

  it('should confirm a link on the account page', () => {
    expect(oauthSuccessPath('link', '/account', { isNewAccount: false })).toBe(
      '/account?auth=linked'
    )
  })

  it('should resume the destination after a login, unless the account is brand new', () => {
    expect(oauthSuccessPath('login', '/lists', { isNewAccount: false })).toBe('/lists')
    expect(oauthSuccessPath('login', '/lists', { isNewAccount: true })).toBe(
      '/account?auth=created'
    )
  })
})
