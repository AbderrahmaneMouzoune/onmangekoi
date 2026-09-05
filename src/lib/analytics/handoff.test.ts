import { beforeEach, describe, expect, it } from 'vitest'

import { markOnce, rememberSessionEntry, takeSessionEntry } from './handoff'

/** `Storage` minimal en mémoire — assez pour ce que le module en attend. */
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  }
}

/** `Storage` qui refuse tout, comme en navigation privée. */
function brokenStorage(): Storage {
  const throwing = () => {
    throw new Error('storage disabled')
  }
  return {
    length: 0,
    clear: throwing,
    getItem: throwing,
    key: throwing,
    removeItem: throwing,
    setItem: throwing,
  }
}

describe('session entry handoff', () => {
  let storage: Storage

  beforeEach(() => {
    storage = fakeStorage()
  })

  it('should hand the creation intent over to the arrival page', () => {
    rememberSessionEntry({ kind: 'created', listCount: 2 }, storage, 1_000)
    expect(takeSessionEntry(storage, 1_000)).toEqual({ kind: 'created', listCount: 2 })
  })

  it('should consume the intent only once', () => {
    rememberSessionEntry({ kind: 'joined', via: 'scan' }, storage, 1_000)
    expect(takeSessionEntry(storage, 1_000)).toEqual({ kind: 'joined', via: 'scan' })
    expect(takeSessionEntry(storage, 1_000)).toBeNull()
  })

  it('should ignore an intent left behind by an abandoned attempt', () => {
    rememberSessionEntry({ kind: 'created', listCount: 0 }, storage, 0)
    expect(takeSessionEntry(storage, 6 * 60_000)).toBeNull()
  })

  it('should return null when nothing was stored', () => {
    expect(takeSessionEntry(storage, 1_000)).toBeNull()
  })

  it('should ignore a corrupted payload', () => {
    storage.setItem('omk.analytics.entry', '{ not json')
    expect(takeSessionEntry(storage, 1_000)).toBeNull()

    storage.setItem('omk.analytics.entry', JSON.stringify({ entry: { kind: 'bidon' }, at: 1_000 }))
    expect(takeSessionEntry(storage, 1_000)).toBeNull()
  })

  it('should stay silent when the storage is unavailable', () => {
    const broken = brokenStorage()
    expect(() => rememberSessionEntry({ kind: 'joined', via: 'code' }, broken, 0)).not.toThrow()
    expect(takeSessionEntry(broken, 0)).toBeNull()
    expect(takeSessionEntry(null, 0)).toBeNull()
  })
})

describe('markOnce', () => {
  it('should be true the first time only', () => {
    const storage = fakeStorage()
    expect(markOnce('entry.abc', storage)).toBe(true)
    expect(markOnce('entry.abc', storage)).toBe(false)
    expect(markOnce('entry.def', storage)).toBe(true)
  })

  it('should let the event through when no storage is available', () => {
    expect(markOnce('entry.abc', null)).toBe(true)
    expect(markOnce('entry.abc', brokenStorage())).toBe(true)
  })
})
