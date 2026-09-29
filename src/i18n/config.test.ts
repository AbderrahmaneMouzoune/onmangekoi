import { describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, isLocale, negotiateLocale } from './config'

describe('isLocale', () => {
  it('should only accept the languages the app serves', () => {
    expect(isLocale('fr')).toBe(true)
    expect(isLocale('en')).toBe(true)
    expect(isLocale('de')).toBe(false)
    expect(isLocale('FR')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})

describe('negotiateLocale', () => {
  it('should pick the preferred language the app knows', () => {
    expect(negotiateLocale('en-GB,en;q=0.9,fr;q=0.8')).toBe('en')
    expect(negotiateLocale('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr')
    expect(negotiateLocale('de-DE,de;q=0.9,en;q=0.5')).toBe('en')
  })

  it('should follow the weights rather than the order', () => {
    expect(negotiateLocale('fr;q=0.3,en;q=0.8')).toBe('en')
  })

  it('should fall back on French', () => {
    expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE)
    expect(negotiateLocale('')).toBe(DEFAULT_LOCALE)
    expect(negotiateLocale('de,es')).toBe(DEFAULT_LOCALE)
    expect(negotiateLocale('en;q=0')).toBe(DEFAULT_LOCALE)
  })
})
