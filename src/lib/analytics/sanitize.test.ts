import { describe, expect, it } from 'vitest'

import { maskPathname, sanitizeProperties, sanitizeUrl } from './sanitize'

describe('maskPathname', () => {
  it('should mask the invite code carried by a session route', () => {
    expect(maskPathname('/sessions/7K3M9P')).toBe('/sessions/[code]')
    expect(maskPathname('/sessions/7K3M9P/results')).toBe('/sessions/[code]/results')
  })

  it('should mask an invite code or an old token, never the value itself', () => {
    expect(maskPathname('/join/7K3M9P')).toBe('/join/[code]')
    expect(maskPathname('/join/a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5')).toBe('/join/[code]')
  })

  it('should mask a list route, decorative slug included', () => {
    expect(maskPathname('/l/H4V2Q8ZX0M')).toBe('/l/[code]')
    expect(maskPathname('/l/restos-du-bureau-H4V2Q8ZX0M')).toBe('/l/[code]')
    expect(maskPathname('/lists/H4V2Q8ZX0M')).toBe('/lists/[code]')
  })

  it('should still mask the uuid form of old links', () => {
    expect(maskPathname('/sessions/0f8fad5b-d9cb-469f-a165-70867728950e')).toBe('/sessions/[code]')
    expect(maskPathname('/lists/0f8fad5b-d9cb-469f-a165-70867728950e')).toBe('/lists/[code]')
  })

  it('should keep static routes untouched', () => {
    expect(maskPathname('/')).toBe('/')
    expect(maskPathname('/sessions/new')).toBe('/sessions/new')
    expect(maskPathname('/lists/new')).toBe('/lists/new')
    expect(maskPathname('/join')).toBe('/join')
    expect(maskPathname('/account')).toBe('/account')
  })

  it('should mask identifier-looking segments of unknown routes', () => {
    expect(maskPathname('/futur/0f8fad5b-d9cb-469f-a165-70867728950e/detail')).toBe(
      '/futur/[id]/detail'
    )
    expect(maskPathname('/futur/H4V2Q8ZX0M')).toBe('/futur/[id]')
  })

  it('should ignore a trailing slash', () => {
    expect(maskPathname('/sessions/7K3M9P/')).toBe('/sessions/[code]')
  })
})

describe('sanitizeUrl', () => {
  it('should drop the query string and the fragment', () => {
    expect(sanitizeUrl('https://onmangekoi.fr/setup?next=%2Fjoin%2F7K3M9P')).toBe(
      'https://onmangekoi.fr/setup'
    )
    expect(sanitizeUrl('/setup?next=%2Fjoin%2F7K3M9P#top')).toBe('/setup')
  })

  it('should mask the path of an absolute URL and keep its origin', () => {
    expect(sanitizeUrl('https://onmangekoi.fr/join/7K3M9P')).toBe(
      'https://onmangekoi.fr/join/[code]'
    )
  })

  it('should return a non-URL value untouched', () => {
    expect(sanitizeUrl('$direct')).toBe('$direct')
    expect(sanitizeUrl('')).toBe('')
  })
})

describe('sanitizeProperties', () => {
  it('should sanitize every property carrying a URL, whatever its prefix', () => {
    const properties = sanitizeProperties({
      $current_url: 'https://onmangekoi.fr/sessions/7K3M9P',
      $pathname: '/sessions/7K3M9P',
      $initial_current_url: 'https://onmangekoi.fr/join/7K3M9P',
      $referrer: '$direct',
      session_id: '0f8fad5b-d9cb-469f-a165-70867728950e',
      restaurant_count: 6,
    })

    expect(properties).toEqual({
      $current_url: 'https://onmangekoi.fr/sessions/[code]',
      $pathname: '/sessions/[code]',
      $initial_current_url: 'https://onmangekoi.fr/join/[code]',
      $referrer: '$direct',
      // Un identifiant envoyé volontairement reste intact : il est opaque.
      session_id: '0f8fad5b-d9cb-469f-a165-70867728950e',
      restaurant_count: 6,
    })
  })
})
