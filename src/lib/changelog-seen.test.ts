import { describe, expect, it } from 'vitest'

import {
  CHANGELOG_SEEN_KEY,
  hasUnreadRelease,
  initSeenRelease,
  readSeenRelease,
  rememberSeenRelease,
} from './changelog-seen'

/** `localStorage` minimal, sans jsdom : ce module ne fait que lire et écrire. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial))
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value),
  }
}

/** Stockage qui refuse tout, comme en navigation privée. */
function blockedStorage(): Storage {
  return {
    ...fakeStorage(),
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  }
}

describe('readSeenRelease', () => {
  it('should return null when nothing has been read yet', () => {
    expect(readSeenRelease(fakeStorage())).toBeNull()
    expect(readSeenRelease(null)).toBeNull()
  })

  it('should return the stored version', () => {
    expect(readSeenRelease(fakeStorage({ [CHANGELOG_SEEN_KEY]: '1.2.0' }))).toBe('1.2.0')
  })

  it('should survive a storage that throws', () => {
    expect(readSeenRelease(blockedStorage())).toBeNull()
  })
})

describe('rememberSeenRelease', () => {
  it('should store the version that was read', () => {
    const storage = fakeStorage()
    rememberSeenRelease('1.2.0', storage)
    expect(storage.getItem(CHANGELOG_SEEN_KEY)).toBe('1.2.0')
  })

  it('should never move the marker backwards', () => {
    const storage = fakeStorage({ [CHANGELOG_SEEN_KEY]: '1.2.0' })
    rememberSeenRelease('1.1.0', storage)
    expect(storage.getItem(CHANGELOG_SEEN_KEY)).toBe('1.2.0')
  })

  it('should survive a storage that throws', () => {
    expect(() => rememberSeenRelease('1.2.0', blockedStorage())).not.toThrow()
  })
})

describe('initSeenRelease', () => {
  it('should mark the current release as read on a first visit', () => {
    const storage = fakeStorage()
    initSeenRelease('1.2.0', storage)
    expect(storage.getItem(CHANGELOG_SEEN_KEY)).toBe('1.2.0')
  })

  it('should leave an existing marker alone', () => {
    const storage = fakeStorage({ [CHANGELOG_SEEN_KEY]: '1.0.0' })
    initSeenRelease('1.2.0', storage)
    expect(storage.getItem(CHANGELOG_SEEN_KEY)).toBe('1.0.0')
  })
})

describe('hasUnreadRelease', () => {
  it('should light up only when a newer release exists', () => {
    expect(hasUnreadRelease('1.2.0', '1.1.0')).toBe(true)
    expect(hasUnreadRelease('1.2.0', '1.2.0')).toBe(false)
    expect(hasUnreadRelease('1.2.0', '1.3.0')).toBe(false)
  })

  it('should stay silent when nothing is known', () => {
    expect(hasUnreadRelease('1.2.0', null)).toBe(false)
    expect(hasUnreadRelease(null, '1.2.0')).toBe(false)
  })
})
