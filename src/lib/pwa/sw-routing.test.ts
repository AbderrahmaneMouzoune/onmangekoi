import { describe, expect, it } from 'vitest'

import { staticAssetsIn, swStrategy } from './sw-routing'

import type { SwRequestInfo } from './sw-routing'

const ORIGIN = 'https://onmangekoi.test'
const SUPABASE = 'https://abc.supabase.co'

function request(overrides: Partial<SwRequestInfo> & { url: string }): SwRequestInfo {
  return {
    method: 'GET',
    mode: 'cors',
    origin: ORIGIN,
    supabaseOrigin: SUPABASE,
    isServerAction: false,
    isRsc: false,
    ...overrides,
  }
}

describe('swStrategy', () => {
  it('should never touch Supabase, even for a plain GET', () => {
    expect(swStrategy(request({ url: `${SUPABASE}/rest/v1/sessions?select=*` }))).toBe(
      'network-only'
    )
    expect(swStrategy(request({ url: `${SUPABASE}/storage/v1/object/x.woff2` }))).toBe(
      'network-only'
    )
  })

  it('should leave Supabase alone when it shares the app origin', () => {
    expect(
      swStrategy(request({ url: `${ORIGIN}/_next/static/chunks/a.js`, supabaseOrigin: ORIGIN }))
    ).toBe('network-only')
  })

  it('should let every non-GET request through untouched', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(
        swStrategy(request({ method, url: `${ORIGIN}/sessions/7K3M9P`, mode: 'navigate' }))
      ).toBe('network-only')
    }
  })

  it('should never cache Server Actions or RSC payloads', () => {
    const url = `${ORIGIN}/sessions/7K3M9P`
    expect(swStrategy(request({ url, isServerAction: true }))).toBe('network-only')
    expect(swStrategy(request({ url, isRsc: true }))).toBe('network-only')
    expect(swStrategy(request({ url: `${url}?_rsc=1x2y3` }))).toBe('network-only')
  })

  it('should never cache the API, the auth callbacks or the worker itself', () => {
    expect(swStrategy(request({ url: `${ORIGIN}/api/places?q=pizza` }))).toBe('network-only')
    // La route d'envoi des notifications push (#7) : jamais en cache, quel que soit le verbe.
    expect(swStrategy(request({ url: `${ORIGIN}/api/push/dispatch` }))).toBe('network-only')
    expect(swStrategy(request({ url: `${ORIGIN}/api/push/dispatch`, method: 'POST' }))).toBe(
      'network-only'
    )
    expect(swStrategy(request({ url: `${ORIGIN}/auth/confirm?token=x`, mode: 'navigate' }))).toBe(
      'network-only'
    )
    expect(swStrategy(request({ url: `${ORIGIN}/sw.js` }))).toBe('network-only')
  })

  it('should send navigations to the network with the offline fallback', () => {
    expect(swStrategy(request({ url: `${ORIGIN}/`, mode: 'navigate' }))).toBe('navigate')
    expect(
      swStrategy(request({ url: `${ORIGIN}/sessions/7K3M9P/results`, mode: 'navigate' }))
    ).toBe('navigate')
  })

  it('should serve hashed static files and fonts from the cache first', () => {
    expect(swStrategy(request({ url: `${ORIGIN}/_next/static/chunks/app-1a2b.js` }))).toBe(
      'cache-first'
    )
    expect(swStrategy(request({ url: `${ORIGIN}/_next/static/media/instrument-s.p.woff2` }))).toBe(
      'cache-first'
    )
  })

  it('should leave other origins and unknown same-origin requests to the network', () => {
    expect(swStrategy(request({ url: 'https://eu.i.posthog.com/e/' }))).toBe('network-only')
    expect(swStrategy(request({ url: 'https://tile.openstreetmap.org/1/2/3.png' }))).toBe(
      'network-only'
    )
    expect(swStrategy(request({ url: `${ORIGIN}/manifest.webmanifest` }))).toBe('network-only')
    expect(swStrategy(request({ url: 'pas une url' }))).toBe('network-only')
  })
})

describe('staticAssetsIn', () => {
  it('should list the scripts, stylesheets and preloaded fonts of a page, once each', () => {
    const html = `
      <link rel="preload" href="/_next/static/media/abc-s.p.woff2" as="font" crossorigin="">
      <link rel="stylesheet" href="/_next/static/chunks/e1f2.css" data-precedence="next">
      <script src="/_next/static/chunks/main-app.js" async=""></script>
      <script src="/_next/static/chunks/main-app.js" async=""></script>
      <script>self.__next_f.push([1,"0:[\\"/_next/static/chunks/page-9z.js\\"]"])</script>
      <img src="/_next/static/media/photo.png">
      <link rel="icon" href="/icon?4f3e2d">
    `
    expect(staticAssetsIn(html)).toEqual([
      '/_next/static/chunks/e1f2.css',
      '/_next/static/chunks/main-app.js',
      '/_next/static/chunks/page-9z.js',
      '/_next/static/media/abc-s.p.woff2',
    ])
  })

  it('should return nothing for an empty page', () => {
    expect(staticAssetsIn('')).toEqual([])
  })
})

describe('self-contained rules', () => {
  // Le service worker ne reçoit que la source de ces fonctions : elles ne
  // doivent rien emprunter au module. Réévaluées seules, elles doivent rendre
  // les mêmes réponses.
  it('should behave the same once copied out of this module', () => {
    const strategy = new Function(`return (${swStrategy.toString()})`)() as typeof swStrategy
    const assets = new Function(`return (${staticAssetsIn.toString()})`)() as typeof staticAssetsIn

    expect(strategy(request({ url: `${ORIGIN}/`, mode: 'navigate' }))).toBe('navigate')
    expect(strategy(request({ url: `${SUPABASE}/rest/v1/x` }))).toBe('network-only')
    expect(strategy(request({ url: `${ORIGIN}/_next/static/chunks/a.js` }))).toBe('cache-first')
    expect(assets('<script src="/_next/static/chunks/a.js">')).toEqual([
      '/_next/static/chunks/a.js',
    ])
  })
})
