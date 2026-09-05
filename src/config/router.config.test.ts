import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { PROTECTED_PREFIXES, router } from './router.config'

describe('router', () => {
  it('should build static and dynamic routes', () => {
    expect(router.home()).toBe('/')
    expect(router.join()).toBe('/join')
    expect(router.joinInvite('A3F9B2')).toBe('/join/A3F9B2')
    expect(router.session('abc')).toBe('/sessions/abc')
    expect(router.sessionResults('abc')).toBe('/sessions/abc/results')
    expect(router.list('l1')).toBe('/lists/l1')
    expect(router.authConfirm()).toBe('/auth/confirm')
    expect(router.account({ auth: 'expired' })).toBe('/account?auth=expired')
  })

  it('should carry the destination through onboarding and login', () => {
    expect(router.setup('/join/abc')).toBe('/setup?next=%2Fjoin%2Fabc')
    expect(router.setup('/')).toBe('/setup')
    expect(router.setup()).toBe('/setup')
    expect(router.login('/lists')).toBe('/login?next=%2Flists')
  })

  it('should build human-friendly shared list links, slug optional', () => {
    expect(router.sharedList('7K3M9P2QWX', 'Restos du bureau')).toBe(
      '/l/restos-du-bureau-7K3M9P2QWX'
    )
    expect(router.sharedList('7K3M9P2QWX')).toBe('/l/7K3M9P2QWX')
    expect(router.sharedList('7K3M9P2QWX', '!!!')).toBe('/l/7K3M9P2QWX')
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
