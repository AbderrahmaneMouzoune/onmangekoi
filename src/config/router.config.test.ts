import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { PROTECTED_PREFIXES, router } from './router.config'

describe('router', () => {
  it('should build static and dynamic routes', () => {
    expect(router.home()).toBe('/')
    expect(router.join()).toBe('/join')
    expect(router.joinInvite('A3F9B2')).toBe('/join/A3F9B2')
    expect(router.session('7K3M9P')).toBe('/sessions/7K3M9P')
    expect(router.sessionResults('7K3M9P')).toBe('/sessions/7K3M9P/results')
    expect(router.list('7K3M9P2QWX')).toBe('/lists/7K3M9P2QWX')
    expect(router.authConfirm()).toBe('/auth/confirm')
    expect(router.account({ auth: 'expired' })).toBe('/account?auth=expired')
  })

  it('should carry the destination through onboarding and login', () => {
    expect(router.setup('/join/abc')).toBe('/setup?next=%2Fjoin%2Fabc')
    expect(router.setup('/')).toBe('/setup')
    expect(router.setup()).toBe('/setup')
    expect(router.login('/lists')).toBe('/login?next=%2Flists')
  })

  it('should address a session by its invite code, never by its id', () => {
    const session = { id: 'ffffffff-0000-4000-8000-000000000000', invite_code: '7K3M9P' }
    expect(router.session(session)).toBe('/sessions/7K3M9P')
    expect(router.sessionResults(session)).toBe('/sessions/7K3M9P/results')
    expect(router.joinInvite(session)).toBe('/join/7K3M9P')
  })

  it('should address a list by its share code, never by its id', () => {
    const list = { id: 'ffffffff-0000-4000-8000-000000000000', share_code: '7K3M9P2QWX' }
    expect(router.list(list)).toBe('/lists/7K3M9P2QWX')
    expect(router.sharedList(list)).toBe('/l/7K3M9P2QWX')
  })
})

describe('proxy matcher', () => {
  it('should cover every protected prefix', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '../proxy.ts'), 'utf8')
    const matcherBlock = source.slice(source.indexOf('matcher:'))
    for (const prefix of PROTECTED_PREFIXES) {
      expect(matcherBlock).toContain(`'${prefix}/:path*'`)
    }
  })
})
