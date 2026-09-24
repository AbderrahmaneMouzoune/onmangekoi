import { describe, expect, it } from 'vitest'

import {
  countActiveFilters,
  radiusLabel,
  NO_FILTERS,
  parseRestaurantFilters,
  restaurantFiltersToParams,
} from './restaurant-filters'

describe('parseRestaurantFilters', () => {
  it('should read budget, diets and radius from a URL', () => {
    const filters = parseRestaurantFilters(new URLSearchParams('budget=2&tags=vegan,halal&km=1'))

    expect(filters).toEqual({ priceMax: 2, tags: ['vegan', 'halal'], withinKm: 1 })
  })

  it('should read the searchParams of a server page too', () => {
    expect(parseRestaurantFilters({ budget: '3', tags: ['vegan'] })).toEqual({
      priceMax: 3,
      tags: ['vegan'],
      withinKm: null,
    })
  })

  it('should filter nothing when the URL is empty', () => {
    expect(parseRestaurantFilters(new URLSearchParams())).toEqual(NO_FILTERS)
  })

  it('should ignore a budget out of bounds or not a whole number', () => {
    for (const budget of ['0', '5', '2.5', 'gratuit', '']) {
      expect(parseRestaurantFilters(new URLSearchParams({ budget })).priceMax).toBeNull()
    }
  })

  it('should ignore an invented diet without dropping the others', () => {
    expect(parseRestaurantFilters(new URLSearchParams('tags=vegan,pizza')).tags).toEqual(['vegan'])
  })

  it('should dedupe the diets and order them like the catalog', () => {
    expect(parseRestaurantFilters(new URLSearchParams('tags=halal,vegan,vegan')).tags).toEqual([
      'vegan',
      'halal',
    ])
  })

  it('should only accept a radius the interface offers', () => {
    expect(parseRestaurantFilters(new URLSearchParams('km=0.5')).withinKm).toBe(0.5)
    expect(parseRestaurantFilters(new URLSearchParams('km=3')).withinKm).toBeNull()
    expect(parseRestaurantFilters(new URLSearchParams('km=-1')).withinKm).toBeNull()
  })
})

describe('restaurantFiltersToParams', () => {
  it('should write only the filters that are set', () => {
    expect(restaurantFiltersToParams(NO_FILTERS).toString()).toBe('')
    expect(
      restaurantFiltersToParams({ priceMax: 2, tags: ['vegan'], withinKm: 0.5 }).toString()
    ).toBe('budget=2&tags=vegan&km=0.5')
  })

  it('should round-trip through the reader', () => {
    const filters = { priceMax: 4, tags: ['vegetarian', 'gluten_free'] as const, withinKm: 2 }
    const params = restaurantFiltersToParams({ ...filters, tags: [...filters.tags] })

    expect(parseRestaurantFilters(params)).toEqual({ ...filters, tags: [...filters.tags] })
  })
})

describe('countActiveFilters', () => {
  it('should count every diet, the budget and the radius', () => {
    expect(countActiveFilters(NO_FILTERS)).toBe(0)
    expect(countActiveFilters({ priceMax: 2, tags: ['vegan', 'halal'], withinKm: 1 })).toBe(4)
  })
})

describe('radiusLabel', () => {
  it('should switch from metres to kilometres', () => {
    expect(radiusLabel(0.5)).toBe('500 m')
    expect(radiusLabel(1)).toBe('1 km')
    expect(radiusLabel(5)).toBe('5 km')
  })
})
