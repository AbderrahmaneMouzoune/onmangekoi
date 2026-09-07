// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  parseVisitHint,
  readVisitHint,
  rememberVisit,
  serializeVisitHint,
  VISIT_HINT_ATTRIBUTE,
  VISIT_HINT_KEY,
  VISIT_HINT_SCRIPT,
} from './visit-hint'

describe('serializeVisitHint', () => {
  it('should say nothing without a pseudo — rien de personnel à réserver', () => {
    expect(serializeVisitHint({ account: false, sessions: true, lists: true })).toBe('')
  })

  it('should list what the last visit held', () => {
    expect(serializeVisitHint({ account: true, sessions: false, lists: false })).toBe('account')
    expect(serializeVisitHint({ account: true, sessions: true, lists: true })).toBe(
      'account sessions lists'
    )
  })
})

describe('parseVisitHint', () => {
  it('should treat an unknown or empty value as a first visit', () => {
    expect(parseVisitHint(null)).toEqual({ account: false, sessions: false, lists: false })
    expect(parseVisitHint('')).toEqual({ account: false, sessions: false, lists: false })
    // Des jetons sans « account » ne peuvent venir que d'une écriture cassée.
    expect(parseVisitHint('sessions lists')).toEqual({
      account: false,
      sessions: false,
      lists: false,
    })
  })

  it('should round-trip what was written', () => {
    const hint = { account: true, sessions: true, lists: false }
    expect(parseVisitHint(serializeVisitHint(hint))).toEqual(hint)
  })
})

describe('rememberVisit', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute(VISIT_HINT_ATTRIBUTE)
  })

  it('should know nothing before the first visit', () => {
    expect(readVisitHint()).toEqual({ account: false, sessions: false, lists: false })
    expect(document.documentElement.hasAttribute(VISIT_HINT_ATTRIBUTE)).toBe(false)
  })

  it('should keep the fields it is not told about', () => {
    rememberVisit({ account: true, sessions: true, lists: true })
    // L'en-tête ne connaît que le pseudo : il ne doit pas effacer le reste.
    rememberVisit({ account: true })

    expect(readVisitHint()).toEqual({ account: true, sessions: true, lists: true })
  })

  it('should apply the shape to the document, for the page already open', () => {
    rememberVisit({ account: true, lists: true })
    expect(document.documentElement.getAttribute(VISIT_HINT_ATTRIBUTE)).toBe('account lists')
  })

  it('should forget everything when the pseudo is gone', () => {
    rememberVisit({ account: true, sessions: true, lists: true })
    rememberVisit({ account: false })

    expect(window.localStorage.getItem(VISIT_HINT_KEY)).toBeNull()
    expect(document.documentElement.hasAttribute(VISIT_HINT_ATTRIBUTE)).toBe(false)
  })
})

describe('VISIT_HINT_SCRIPT', () => {
  it('should apply the stored shape before the first paint', () => {
    window.localStorage.setItem(VISIT_HINT_KEY, 'account sessions')

    new Function(VISIT_HINT_SCRIPT)()

    expect(document.documentElement.getAttribute(VISIT_HINT_ATTRIBUTE)).toBe('account sessions')
  })

  it('should stay silent when storage throws (navigation privée)', () => {
    const storage = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('stockage bloqué')
      },
    })
    document.documentElement.removeAttribute(VISIT_HINT_ATTRIBUTE)

    expect(() => new Function(VISIT_HINT_SCRIPT)()).not.toThrow()
    expect(document.documentElement.hasAttribute(VISIT_HINT_ATTRIBUTE)).toBe(false)

    if (storage) Object.defineProperty(window, 'localStorage', storage)
  })
})
