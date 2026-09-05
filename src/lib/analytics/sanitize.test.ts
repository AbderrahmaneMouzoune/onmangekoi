import { describe, expect, it } from 'vitest'

import { maskPathname, sanitizeProperties, sanitizeUrl } from './sanitize'

describe('maskPathname', () => {
  it('should mask the identifier of a session route', () => {
    expect(maskPathname('/sessions/0f8fad5b-d9cb-469f-a165-70867728950e')).toBe('/sessions/[id]')
    expect(maskPathname('/sessions/0f8fad5b-d9cb-469f-a165-70867728950e/results')).toBe(
      '/sessions/[id]/results'
    )
  })

  it('should mask an invite token or code, never the value itself', () => {
    expect(maskPathname('/join/7K3M9P')).toBe('/join/[invite]')
    expect(maskPathname('/join/a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5')).toBe('/join/[invite]')
  })

  it('should mask a shared list link, slug included', () => {
    expect(maskPathname('/l/restos-du-bureau-H4V2Q8ZX0M')).toBe('/l/[list]')
    expect(maskPathname('/lists/0f8fad5b-d9cb-469f-a165-70867728950e')).toBe('/lists/[id]')
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
    expect(maskPathname('/sessions/0f8fad5b-d9cb-469f-a165-70867728950e/')).toBe('/sessions/[id]')
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
      'https://onmangekoi.fr/join/[invite]'
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
      $current_url: 'https://onmangekoi.fr/sessions/0f8fad5b-d9cb-469f-a165-70867728950e',
      $pathname: '/sessions/0f8fad5b-d9cb-469f-a165-70867728950e',
      $initial_current_url: 'https://onmangekoi.fr/join/7K3M9P',
      $referrer: '$direct',
      session_id: '0f8fad5b-d9cb-469f-a165-70867728950e',
      restaurant_count: 6,
    })

    expect(properties).toEqual({
      $current_url: 'https://onmangekoi.fr/sessions/[id]',
      $pathname: '/sessions/[id]',
      $initial_current_url: 'https://onmangekoi.fr/join/[invite]',
      $referrer: '$direct',
      // Un identifiant envoyé volontairement reste intact : il est opaque.
      session_id: '0f8fad5b-d9cb-469f-a165-70867728950e',
      restaurant_count: 6,
    })
  })
})
