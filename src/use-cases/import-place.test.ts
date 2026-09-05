import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const getPlaceDetails = vi.hoisted(() => vi.fn())
const upsertRestaurantFromPlace = vi.hoisted(() => vi.fn())

vi.mock('@/data-access/places', () => ({ getPlaceDetails }))
vi.mock('@/data-access/restaurants', () => ({ upsertRestaurantFromPlace }))

import { AppError } from '@/domain/errors'

import { importPlaceUseCase } from './import-place'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

const CLIENT = {} as SupabaseClient<Database>

const PLACE = {
  placeId: 'ChIJsushi',
  name: 'Sushi Bar Sakura',
  address: '12 rue de la Ré, Lyon',
  city: 'Lyon',
  cuisineType: 'Japonais',
  latitude: 45.76,
  longitude: 4.83,
  priceLevel: 2,
}

describe('importPlaceUseCase', () => {
  it('should write exactly what Google returned, not what the caller passed', async () => {
    getPlaceDetails.mockResolvedValue(PLACE)
    upsertRestaurantFromPlace.mockResolvedValue({ id: 'uuid', name: PLACE.name })

    await expect(importPlaceUseCase(CLIENT, 'ChIJsushi')).resolves.toEqual({
      id: 'uuid',
      name: PLACE.name,
    })
    expect(getPlaceDetails).toHaveBeenCalledWith('ChIJsushi')
    expect(upsertRestaurantFromPlace).toHaveBeenCalledWith(CLIENT, PLACE)
  })

  it('should refuse a place Google no longer knows, without touching the database', async () => {
    getPlaceDetails.mockResolvedValue(null)
    upsertRestaurantFromPlace.mockClear()

    await expect(importPlaceUseCase(CLIENT, 'ChIJgone')).rejects.toBeInstanceOf(AppError)
    expect(upsertRestaurantFromPlace).not.toHaveBeenCalled()
  })
})
