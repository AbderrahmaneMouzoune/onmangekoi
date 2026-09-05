import { describe, expect, it } from 'vitest'

import {
  cityFromPlace,
  cuisineFromPlace,
  locationFromPlace,
  mapPlace,
  mapPlaceDetails,
  mapPlacesResponse,
  openingHoursFromPlace,
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

describe('locationFromPlace', () => {
  it('should refuse coordinates Google gives out of bounds or not at all', () => {
    expect(locationFromPlace({ location: { latitude: 91, longitude: 4.83 } })).toBeNull()
    expect(locationFromPlace({ location: { latitude: 45.76 } })).toBeNull()
    expect(locationFromPlace({})).toBeNull()
  })
})

describe('openingHoursFromPlace', () => {
  it('should translate Google periods into the shape the database accepts', () => {
    expect(
      openingHoursFromPlace({
        regularOpeningHours: {
          periods: [
            { open: { day: 1, hour: 11, minute: 30 }, close: { day: 1, hour: 14, minute: 0 } },
            { open: { day: 5, hour: 19, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
          ],
        },
      })
    ).toEqual({
      periods: [
        { day: 1, open: '11:30', close: '14:00' },
        // Une fermeture le lendemain passe minuit : `domain/opening-hours` le
        // lit ainsi, on garde donc le jour d'ouverture.
        { day: 5, open: '19:00', close: '02:00' },
      ],
    })
  })

  it('should read a period without a closing time as open all day', () => {
    expect(
      openingHoursFromPlace({
        regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] },
      })
    ).toEqual({ periods: [{ day: 0, open: '00:00', close: '24:00' }] })
  })

  it('should ignore a period the app could not use', () => {
    expect(
      openingHoursFromPlace({
        regularOpeningHours: {
          periods: [
            // Sans jour d'ouverture, la période ne décrit rien.
            { close: { day: 2, hour: 14, minute: 0 } },
            // Ouverture = fermeture : plage vide.
            { open: { day: 3, hour: 12, minute: 0 }, close: { day: 3, hour: 12, minute: 0 } },
          ],
        },
      })
    ).toBeNull()
  })

  it('should say nothing rather than invent hours', () => {
    expect(openingHoursFromPlace({})).toBeNull()
    expect(openingHoursFromPlace({ regularOpeningHours: { periods: [] } })).toBeNull()
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
      priceLevel: 2,
      location: { lat: 45.76, lng: 4.83 },
      description: null,
      website: null,
      openingHours: null,
      photoName: null,
      photoUrl: null,
    })
  })

  it('should keep the enriched fields a place detail carries', () => {
    const place = mapPlace({
      ...SUSHI,
      editorialSummary: { text: 'Sushis préparés à la commande.' },
      websiteUri: 'https://sakura.example',
      photos: [{ name: 'places/ChIJsushi/photos/AbC' }, { name: 'places/ChIJsushi/photos/Second' }],
    })

    expect(place?.description).toBe('Sushis préparés à la commande.')
    expect(place?.website).toBe('https://sakura.example')
    // Une seule photo nous intéresse : c'est la première que Google juge la
    // plus représentative, et chacune coûte un appel de plus à résoudre.
    expect(place?.photoName).toBe('places/ChIJsushi/photos/AbC')
    // La résolution est le travail de la passerelle, pas du mapping.
    expect(place?.photoUrl).toBeNull()
  })

  it('should refuse a website that is not an HTTP link', () => {
    expect(mapPlace({ ...SUSHI, websiteUri: 'javascript:alert(1)' })?.website).toBeNull()
    expect(mapPlace({ ...SUSHI, websiteUri: '  ' })?.website).toBeNull()
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
