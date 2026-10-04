import { describe, expect, it } from 'vitest'

import { config } from '@/proxy'

import { PROTECTED_PREFIXES, router } from './router.config'

describe('router', () => {
  it('should build static and dynamic routes', () => {
    expect(router.home()).toBe('/')
    expect(router.join()).toBe('/join')
    expect(router.joinInvite('A3F9B2')).toBe('/join/A3F9B2')
    expect(router.sessions()).toBe('/sessions')
    expect(router.session('7K3M9P')).toBe('/sessions/7K3M9P')
    expect(router.sessionResults('7K3M9P')).toBe('/sessions/7K3M9P/results')
    expect(router.list('7K3M9P2QWX')).toBe('/lists/7K3M9P2QWX')
    expect(router.groups()).toBe('/groups')
    expect(router.duo()).toBe('/duo')
    expect(router.authConfirm()).toBe('/auth/confirm')
    expect(router.account({ auth: 'expired' })).toBe('/account?auth=expired')
    expect(router.changelog()).toBe('/nouveautes')
    expect(router.changelogFeed()).toBe('/nouveautes/rss.xml')
  })

  it('should carry the destination through onboarding and login', () => {
    expect(router.setup('/join/abc')).toBe('/setup?next=%2Fjoin%2Fabc')
    expect(router.setup('/')).toBe('/setup')
    expect(router.setup()).toBe('/setup')
    expect(router.login('/lists')).toBe('/login?next=%2Flists')
  })

  it('should page the history by cursor, never by offset', () => {
    expect(router.sessions({ cursor: null })).toBe('/sessions')
    expect(router.sessions({ cursor: 'MjAyNi0wOS0wNA' })).toBe('/sessions?cursor=MjAyNi0wOS0wNA')
  })

  it('should address a session by its invite code, never by its id', () => {
    const session = { id: 'ffffffff-0000-4000-8000-000000000000', invite_code: '7K3M9P' }
    expect(router.session(session)).toBe('/sessions/7K3M9P')
    expect(router.sessionResults(session)).toBe('/sessions/7K3M9P/results')
    expect(router.joinInvite(session)).toBe('/join/7K3M9P')
  })

  it('should address a public ranking by its own results code', () => {
    const session = {
      id: 'ffffffff-0000-4000-8000-000000000000',
      invite_code: '7K3M9P',
      results_code: 'H4V2Q8ZX0M',
    }
    expect(router.publicResults(session)).toBe('/r/H4V2Q8ZX0M')
    expect(router.publicResults('H4V2Q8ZX0M')).toBe('/r/H4V2Q8ZX0M')
  })

  it('should keep the offline page and the service worker public', () => {
    expect(router.offline()).toBe('/offline')
    expect(router.serviceWorker()).toBe('/sw.js')
    for (const prefix of PROTECTED_PREFIXES) {
      expect(router.offline().startsWith(prefix)).toBe(false)
      expect(router.serviceWorker().startsWith(prefix)).toBe(false)
    }
  })

  it('should protect the duo page: creating a session needs a pseudo first', () => {
    expect(PROTECTED_PREFIXES).toContain('/duo')
    expect(router.setup(router.duo())).toBe('/setup?next=%2Fduo')
  })

  it('should keep the public ranking out of the protected prefixes', () => {
    expect(PROTECTED_PREFIXES).not.toContain('/r')
  })

  it('should address a list by its share code, never by its id', () => {
    const list = { id: 'ffffffff-0000-4000-8000-000000000000', share_code: '7K3M9P2QWX' }
    expect(router.list(list)).toBe('/lists/7K3M9P2QWX')
    expect(router.sharedList(list)).toBe('/l/7K3M9P2QWX')
  })
})

describe('proxy matcher', () => {
  // Next compile le matcher avec path-to-regexp ; ces motifs-là n'utilisent
  // que la syntaxe commune avec les RegExp JavaScript.
  const matchers = config.matcher.map((pattern) => new RegExp(`^${pattern}$`))
  const proxied = (pathname: string) => matchers.some((matcher) => matcher.test(pathname))

  it('should run on every page, so that each one gets its language', () => {
    for (const prefix of PROTECTED_PREFIXES) expect(proxied(`${prefix}/ABC`)).toBe(true)
    expect(proxied('/')).toBe(true)
    expect(proxied(router.setup())).toBe(true)
    expect(proxied(router.publicResults('H4V2Q8ZX0M'))).toBe(true)
    expect(proxied(router.sharedList('restos-du-bureau-H4V2Q8ZX0M'))).toBe(true)
    expect(proxied(router.changelog())).toBe(true)
    expect(proxied(router.offline())).toBe(true)
    expect(proxied(router.authConfirm())).toBe(true)
    expect(proxied('/manifest.webmanifest')).toBe(true)
  })

  it('should leave the API, the assets and the Open Graph images alone', () => {
    expect(proxied('/api/places/search')).toBe(false)
    expect(proxied('/_next/static/chunk.js')).toBe(false)
    expect(proxied(router.serviceWorker())).toBe(false)
    expect(proxied('/icons/icon-192.png')).toBe(false)
    expect(proxied('/icon')).toBe(false)
    expect(proxied('/apple-icon')).toBe(false)
    expect(proxied('/robots.txt')).toBe(false)
    expect(proxied('/sitemap.xml')).toBe(false)
    expect(proxied(router.changelogFeed())).toBe(false)
    expect(proxied('/fr/join/ABC/opengraph-image-1wi81j')).toBe(false)
  })
})
