import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const claimNeighbourhoodImport = vi.hoisted(() => vi.fn())
const searchNearbyPlaces = vi.hoisted(() => vi.fn())
const getPlaceDetails = vi.hoisted(() => vi.fn())
const upsertRestaurantFromPlace = vi.hoisted(() => vi.fn())

vi.mock('@/data-access/place-imports', () => ({ claimNeighbourhoodImport }))
vi.mock('@/data-access/places', () => ({ searchNearbyPlaces, getPlaceDetails }))
vi.mock('@/data-access/restaurants', () => ({ upsertRestaurantFromPlace }))

import { AppError } from '@/domain/errors'
import { NEIGHBOURHOOD_IMPORT_MAX } from '@/domain/schemas/place'

import { seedNeighbourhoodUseCase } from './seed-neighbourhood'

import type { Database } from '@/data-access/models/database'
import type { PlaceResult } from '@/domain/places'
import type { SupabaseClient } from '@supabase/supabase-js'

const CLIENT = {} as SupabaseClient<Database>
const HERE = { latitude: 45.76, longitude: 4.83 }

/** Un lieu tel qu'une *recherche* le rend : sans photo, sans site, sans résumé. */
function place(index: number): PlaceResult {
  return {
    placeId: `ChIJ${index}`,
    name: `Resto ${index}`,
    address: `${index} rue de la Ré, Lyon`,
    city: 'Lyon',
    cuisineType: 'Japonais',
    priceLevel: 2,
    location: { lat: 45.76, lng: 4.83 },
    rating: 4.2,
    ratingCount: 120,
    description: null,
    website: null,
    openingHours: { periods: [{ day: 1, open: '11:30', close: '14:00' }] },
    photoName: null,
    photoUrl: null,
  }
}

function pageOf(count: number) {
  return {
    places: Array.from({ length: count }, (_, index) => place(index)),
    nextPageToken: null,
  }
}

describe('seedNeighbourhoodUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    claimNeighbourhoodImport.mockResolvedValue(2)
    upsertRestaurantFromPlace.mockImplementation(
      async (_client: unknown, imported: PlaceResult) => ({
        id: `uuid-${imported.placeId}`,
        name: imported.name,
      })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should take the slot before spending anything at Google', async () => {
    claimNeighbourhoodImport.mockRejectedValue(new Error('omk:neighbourhood_quota_reached'))

    await expect(seedNeighbourhoodUseCase(CLIENT, HERE)).rejects.toThrow(
      'omk:neighbourhood_quota_reached'
    )
    expect(searchNearbyPlaces).not.toHaveBeenCalled()
    expect(upsertRestaurantFromPlace).not.toHaveBeenCalled()
  })

  it('should write one search, never twenty details', async () => {
    searchNearbyPlaces.mockResolvedValue(pageOf(3))

    const seeded = await seedNeighbourhoodUseCase(CLIENT, HERE)

    expect(searchNearbyPlaces).toHaveBeenCalledWith(HERE)
    expect(getPlaceDetails).not.toHaveBeenCalled()
    expect(seeded.restaurants).toHaveLength(3)
    expect(seeded.remaining).toBe(2)
    expect(upsertRestaurantFromPlace).toHaveBeenCalledWith(CLIENT, place(0))
  })

  it('should stop at the ceiling even when Google is generous', async () => {
    searchNearbyPlaces.mockResolvedValue(pageOf(NEIGHBOURHOOD_IMPORT_MAX + 5))

    const seeded = await seedNeighbourhoodUseCase(CLIENT, HERE)

    expect(seeded.restaurants).toHaveLength(NEIGHBOURHOOD_IMPORT_MAX)
    expect(upsertRestaurantFromPlace).toHaveBeenCalledTimes(NEIGHBOURHOOD_IMPORT_MAX)
  })

  it('should keep what went through when a place is refused, and say how many were not', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    searchNearbyPlaces.mockResolvedValue(pageOf(4))
    upsertRestaurantFromPlace.mockImplementation(async (_client: unknown, one: PlaceResult) => {
      if (one.placeId === 'ChIJ2') throw new Error('omk:invalid_restaurant_name')
      return { id: `uuid-${one.placeId}`, name: one.name }
    })

    const seeded = await seedNeighbourhoodUseCase(CLIENT, HERE)

    expect(seeded.restaurants.map((r) => r.id)).toEqual(['uuid-ChIJ0', 'uuid-ChIJ1', 'uuid-ChIJ3'])
    expect(seeded.failed).toBe(1)
  })

  it('should refuse a neighbourhood where Google finds nothing', async () => {
    searchNearbyPlaces.mockResolvedValue(pageOf(0))

    await expect(seedNeighbourhoodUseCase(CLIENT, HERE)).rejects.toBeInstanceOf(AppError)
    expect(upsertRestaurantFromPlace).not.toHaveBeenCalled()
  })

  it('should refuse a batch where nothing at all could be written', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    searchNearbyPlaces.mockResolvedValue(pageOf(2))
    upsertRestaurantFromPlace.mockRejectedValue(new Error('boom'))

    await expect(seedNeighbourhoodUseCase(CLIENT, HERE)).rejects.toBeInstanceOf(AppError)
  })
})
