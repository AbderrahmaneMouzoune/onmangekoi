import { describe, expect, it } from 'vitest'

import { TtlCache } from './ttl-cache'

describe('TtlCache', () => {
  it('should return what was stored, and nothing for an unknown key', () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 })
    cache.set('sushi', 'résultats')
    expect(cache.get('sushi')).toBe('résultats')
    expect(cache.get('pizza')).toBeUndefined()
  })

  it('should forget an entry once its lifetime is over', () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 })
    cache.set('sushi', 'résultats', 0)
    expect(cache.get('sushi', 999)).toBe('résultats')
    expect(cache.get('sushi', 1000)).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('should restart the lifetime on a rewrite', () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 })
    cache.set('sushi', 'v1', 0)
    cache.set('sushi', 'v2', 900)
    expect(cache.get('sushi', 1500)).toBe('v2')
  })

  it('should evict the least recently used entry once full', () => {
    const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 2 })
    cache.set('a', 1)
    cache.set('b', 2)
    // « a » est relu : c'est « b » qui devient le plus ancien usage.
    expect(cache.get('a')).toBe(1)
    cache.set('c', 3)

    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(1)
    expect(cache.get('c')).toBe(3)
    expect(cache.size).toBe(2)
  })

  it('should empty on demand', () => {
    const cache = new TtlCache<number>({ ttlMs: 1000 })
    cache.set('a', 1)
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.get('a')).toBeUndefined()
  })
})
