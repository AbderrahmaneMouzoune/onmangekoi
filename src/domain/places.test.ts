import { describe, expect, it } from 'vitest'

import {
  cityFromPlace,
  cuisineFromPlace,
  mapPlace,
  mapPlaceDetails,
  mapPlacesResponse,
  placesCacheKey,
  priceLevelFromPlace,
} from './places'

const SUSHI = {
  id: 'ChIJsushi',
  displayName: { text: 'Sushi Bar Sakura', languageCode: 'fr' },
  formattedAddress: '12 rue de la Ré, 69002 Lyon, France',
  primaryType: 'sushi_restaurant',
  primaryTypeDisplayName: { text: 'Restaurant de sushis' },
  priceLevel: 'PRICE_LEVEL_MODERATE',
  location: { latitude: 45.76, longitude: 4.83 },
  addressComponents: [
    { longText: '12', types: ['street_number'] },
    { longText: 'Lyon', shortText: 'Lyon', types: ['locality', 'political'] },
  ],
}

describe('cuisineFromPlace', () => {
  it('should translate a known Google type into the app vocabulary', () => {
    expect(cuisineFromPlace(SUSHI)).toBe('Japonais')
    expect(cuisineFromPlace({ primaryType: 'lebanese_restaurant' })).toBe('Libanais')
  })

  it('should fall back to the localized label Google returns', () => {
    expect(
      cuisineFromPlace({
        primaryType: 'peruvian_restaurant',
        primaryTypeDisplayName: { text: 'Restaurant péruvien' },
      })
    ).toBe('Restaurant péruvien')
  })

  it('should rather return nothing than an invented cuisine', () => {
    expect(cuisineFromPlace({ primaryType: 'peruvian_restaurant' })).toBeNull()
    expect(cuisineFromPlace({})).toBeNull()
  })
})

describe('priceLevelFromPlace', () => {
  it('should map the Google scale onto the app budget', () => {
    expect(priceLevelFromPlace({ priceLevel: 'PRICE_LEVEL_FREE' })).toBe(1)
    expect(priceLevelFromPlace({ priceLevel: 'PRICE_LEVEL_INEXPENSIVE' })).toBe(1)
    expect(priceLevelFromPlace({ priceLevel: 'PRICE_LEVEL_MODERATE' })).toBe(2)
    expect(priceLevelFromPlace({ priceLevel: 'PRICE_LEVEL_EXPENSIVE' })).toBe(3)
    expect(priceLevelFromPlace({ priceLevel: 'PRICE_LEVEL_VERY_EXPENSIVE' })).toBe(4)
  })

  it('should leave the budget empty when Google says nothing', () => {
    expect(priceLevelFromPlace({ priceLevel: 'PRICE_LEVEL_UNSPECIFIED' })).toBeNull()
    expect(priceLevelFromPlace({})).toBeNull()
  })
})

describe('cityFromPlace', () => {
  it('should read the locality, with the sublocality as a fallback', () => {
    expect(cityFromPlace(SUSHI)).toBe('Lyon')
    expect(
      cityFromPlace({ addressComponents: [{ longText: 'Croix-Rousse', types: ['sublocality'] }] })
    ).toBe('Croix-Rousse')
    expect(cityFromPlace({})).toBeNull()
  })
})

describe('mapPlace', () => {
  it('should keep only what the app stores', () => {
    expect(mapPlace(SUSHI)).toEqual({
      placeId: 'ChIJsushi',
      name: 'Sushi Bar Sakura',
      address: '12 rue de la Ré, 69002 Lyon, France',
      city: 'Lyon',
      cuisineType: 'Japonais',
      latitude: 45.76,
      longitude: 4.83,
      priceLevel: 2,
    })
  })

  it('should drop a place without an id or a usable name', () => {
    expect(mapPlace({ displayName: { text: 'Sans identifiant' } })).toBeNull()
    expect(mapPlace({ id: 'ChIJx' })).toBeNull()
    expect(mapPlace({ id: 'ChIJx', displayName: { text: 'A' } })).toBeNull()
  })

  it('should truncate a name too long for the column instead of failing', () => {
    const place = mapPlace({ id: 'ChIJx', displayName: { text: 'a'.repeat(140) } })
    expect(place?.name).toHaveLength(100)
  })
})

describe('mapPlacesResponse', () => {
  it('should map, skip the unusable and deduplicate by place id', () => {
    const results = mapPlacesResponse({
      places: [SUSHI, { displayName: { text: 'Sans id' } }, SUSHI],
    })
    expect(results.map((place) => place.placeId)).toEqual(['ChIJsushi'])
  })

  it('should return nothing rather than throw on an unexpected payload', () => {
    expect(mapPlacesResponse(null)).toEqual([])
    expect(mapPlacesResponse({ places: 'nope' })).toEqual([])
    expect(mapPlacesResponse({})).toEqual([])
  })

  it('should tolerate fields Google adds later', () => {
    const results = mapPlacesResponse({
      places: [{ ...SUSHI, someBrandNewField: { nested: true } }],
      nextPageToken: 'abc',
    })
    expect(results).toHaveLength(1)
  })
})

describe('mapPlaceDetails', () => {
  it('should read a single place payload', () => {
    expect(mapPlaceDetails(SUSHI)?.name).toBe('Sushi Bar Sakura')
    expect(mapPlaceDetails(null)).toBeNull()
  })
})

describe('placesCacheKey', () => {
  it('should ignore case and extra spaces so the cache actually hits', () => {
    expect(placesCacheKey({ query: '  Sushi   Sakura ' })).toBe(
      placesCacheKey({ query: 'sushi sakura' })
    )
  })

  it('should round coordinates so a step of a few metres reuses the cache', () => {
    const a = placesCacheKey({ query: 'sushi', latitude: 45.764043, longitude: 4.835659 })
    const b = placesCacheKey({ query: 'sushi', latitude: 45.764901, longitude: 4.835002 })
    expect(a).toBe(b)
  })

  it('should tell a biased search apart from an unbiased one', () => {
    expect(placesCacheKey({ query: 'sushi', latitude: 45.76, longitude: 4.83 })).not.toBe(
      placesCacheKey({ query: 'sushi' })
    )
  })
})
