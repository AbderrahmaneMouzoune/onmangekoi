import { describe, expect, it } from 'vitest'

import {
  keptSuggestionCount,
  suggestedIds,
  suggestionSummary,
  toRestaurantSuggestion,
  withoutSuggestion,
} from './suggestions'

import type { Restaurant, SuggestedRestaurantRow } from '@/data-access/models'

function restaurant(id: string, name = id): Restaurant {
  return {
    id,
    name,
    cuisine_type: null,
    address: null,
    city: null,
    description: null,
    photo_url: null,
    website: null,
    location: null,
    opening_hours: null,
    created_at: '2026-09-01T10:00:00Z',
    created_by: null,
    source: 'seed',
    price_level: null,
    place_id: null,
    tags: [],
  }
}

function row(
  id: string,
  reason: SuggestedRestaurantRow['reason'],
  source: SuggestedRestaurantRow['source'],
  excludedWinners = 0
): SuggestedRestaurantRow {
  return { restaurant: restaurant(id), reason, source, excluded_winners: excludedWinners }
}

describe('toRestaurantSuggestion', () => {
  it('should propose nothing when there is no history', () => {
    expect(toRestaurantSuggestion([])).toBeNull()
  })

  it('should not trust a lone never-proposed row', () => {
    expect(toRestaurantSuggestion([row('fresh', 'never_proposed', 'catalog')])).toBeNull()
  })

  it('should keep the order and tell where the fresh one comes from', () => {
    const suggestion = toRestaurantSuggestion([
      row('a', 'recent', 'history', 3),
      row('b', 'recent', 'history', 3),
      row('fresh', 'never_proposed', 'mine', 3),
    ])

    expect(suggestedIds(suggestion)).toEqual(['a', 'b', 'fresh'])
    expect(suggestion).toMatchObject({ recentCount: 2, excludedWinners: 3, fresh: 'mine' })
  })

  it('should have no fresh one when the base found none', () => {
    const suggestion = toRestaurantSuggestion([row('a', 'recent', 'history')])
    expect(suggestion?.fresh).toBeNull()
  })
})

describe('suggestionSummary', () => {
  it('should say what was excluded and where the fresh one comes from', () => {
    const suggestion = toRestaurantSuggestion([
      row('a', 'recent', 'history', 3),
      row('b', 'recent', 'history', 3),
      row('fresh', 'never_proposed', 'catalog', 3),
    ])

    expect(suggestionSummary(suggestion!)).toEqual({
      recent: 2,
      winners: 3,
      days: 30,
      fresh: 'catalog',
    })
  })

  it('should count a single winner and a single restaurant', () => {
    const suggestion = toRestaurantSuggestion([
      row('a', 'recent', 'history', 1),
      row('fresh', 'never_proposed', 'mine', 1),
    ])

    expect(suggestionSummary(suggestion!)).toEqual({
      recent: 1,
      winners: 1,
      days: 30,
      fresh: 'mine',
    })
  })

  it('should not mention winners when none were excluded', () => {
    const suggestion = toRestaurantSuggestion([
      row('a', 'recent', 'history'),
      row('b', 'recent', 'history'),
    ])

    expect(suggestionSummary(suggestion!)).toEqual({
      recent: 2,
      winners: 0,
      days: 30,
      fresh: 'none',
    })
  })
})

describe('keptSuggestionCount', () => {
  it('should count the proposed restaurants still selected', () => {
    expect(keptSuggestionCount(['a', 'b', 'c'], ['b', 'x', 'c'])).toBe(2)
    expect(keptSuggestionCount([], ['a'])).toBe(0)
  })
})

describe('withoutSuggestion', () => {
  it('should uncheck the proposal and keep what the person picked', () => {
    expect(withoutSuggestion(['a', 'x', 'b'], ['a', 'b', 'c'])).toEqual(['x'])
  })
})
