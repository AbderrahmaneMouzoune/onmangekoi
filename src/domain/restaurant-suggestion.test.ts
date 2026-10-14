import { describe, expect, it } from 'vitest'

import {
  applicableSuggestion,
  normalizeSuggestion,
  suggestionCacheKey,
} from './restaurant-suggestion'

describe('normalizeSuggestion', () => {
  it('should keep a well-formed suggestion', () => {
    expect(
      normalizeSuggestion({
        found: true,
        cuisine_type: ' Libanais ',
        price_level: 2,
        tags: ['halal', 'halal', 'vegetarian'],
      })
    ).toEqual({ cuisineType: 'Libanais', priceLevel: 2, tags: ['halal', 'vegetarian'] })
  })

  it('should return nothing when the restaurant was not found', () => {
    expect(
      normalizeSuggestion({ found: false, cuisine_type: 'Libanais', price_level: 2, tags: [] })
    ).toBeNull()
  })

  it('should drop each invalid field without losing the others', () => {
    expect(
      normalizeSuggestion({
        found: true,
        cuisine_type: 'x'.repeat(41),
        price_level: 7,
        tags: ['pescatarian', 'vegan'],
      })
    ).toEqual({ cuisineType: null, priceLevel: null, tags: ['vegan'] })
  })

  it('should return nothing for an empty or malformed answer', () => {
    expect(
      normalizeSuggestion({ found: true, cuisine_type: '', price_level: null, tags: [] })
    ).toBeNull()
    expect(normalizeSuggestion({ cuisine: 'Libanais' })).toBeNull()
    expect(normalizeSuggestion(null)).toBeNull()
  })
})

describe('applicableSuggestion', () => {
  const suggestion = { cuisineType: 'Libanais', priceLevel: 2, tags: ['halal' as const] }

  it('should fill every untouched field', () => {
    expect(
      applicableSuggestion(suggestion, { cuisineType: false, priceLevel: false, tags: false })
    ).toEqual(suggestion)
  })

  it('should leave the touched fields to the person', () => {
    expect(
      applicableSuggestion(suggestion, { cuisineType: true, priceLevel: false, tags: true })
    ).toEqual({ cuisineType: null, priceLevel: 2, tags: [] })
  })
})

describe('suggestionCacheKey', () => {
  it('should ignore case and spacing', () => {
    expect(suggestionCacheKey('  Chez  Marcel ', 'Rue du Four')).toBe(
      suggestionCacheKey('chez marcel', 'rue du  four ')
    )
    expect(suggestionCacheKey('Chez Marcel', null)).toBe('chez marcel|')
  })
})
