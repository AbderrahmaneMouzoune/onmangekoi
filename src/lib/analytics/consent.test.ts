// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CONSENT_STORAGE_KEY,
  getConsent,
  parseConsent,
  readConsentFrom,
  resetConsentCache,
  setConsent,
  subscribeConsent,
  writeConsentTo,
} from './consent'

describe('parseConsent', () => {
  it('should only accept the two known choices', () => {
    expect(parseConsent('granted')).toBe('granted')
    expect(parseConsent('denied')).toBe('denied')
    expect(parseConsent(null)).toBe('unset')
    expect(parseConsent('oui')).toBe('unset')
  })
})

describe('consent storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetConsentCache()
  })

  it('should default to unset when nothing was ever chosen', () => {
    expect(getConsent()).toBe('unset')
  })

  it('should remember the choice across reads', () => {
    setConsent('granted')
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('granted')

    resetConsentCache()
    expect(getConsent()).toBe('granted')
  })

  it('should notify subscribers when the choice changes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeConsent(listener)

    setConsent('denied')
    expect(listener).toHaveBeenCalledTimes(1)

    // Rejouer le même choix ne notifie pas.
    setConsent('denied')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setConsent('granted')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('should erase the choice when it is reset', () => {
    setConsent('granted')
    setConsent('unset')
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull()
  })

  it('should survive a storage that refuses to answer', () => {
    expect(readConsentFrom(null)).toBe('unset')
    expect(() => writeConsentTo(null, 'granted')).not.toThrow()
  })
})
