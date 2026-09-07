// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RestaurantPicker } from './restaurant-picker'

import type { Restaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'

const searchRestaurantsAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/restaurants', () => ({
  searchRestaurantsAction,
  createRestaurantAction: vi.fn(),
  findSimilarRestaurantsAction: vi.fn(async () => ({ ok: true, data: [] })),
}))

// L'onglet Google n'est pas rendu ici (pas de clé sur ce déploiement), mais
// son import remonte jusqu'aux modules `server-only` du serveur.
vi.mock('@/actions/places', () => ({ importPlaceAction: vi.fn() }))

const captureEvent = vi.hoisted(() => vi.fn())
vi.mock('@/lib/analytics/client', () => ({ captureEvent }))

/** Position du visiteur : place de la Bastille, Paris. */
const HERE = { latitude: 48.853139, longitude: 2.369171 }

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: crypto.randomUUID(),
    name: 'Le Petit Libanais',
    cuisine_type: null,
    address: null,
    city: null,
    description: null,
    photo_url: null,
    website: null,
    location: null,
    opening_hours: null,
    created_at: new Date().toISOString(),
    created_by: null,
    source: 'manual',
    price_level: null,
    place_id: null,
    ...overrides,
  }
}

function page(items: Restaurant[]): RestaurantPage {
  return { items, hasMore: false, nextOffset: items.length }
}

/** À 240 m de `HERE` */
const CORNER = restaurant({ name: 'Le Bistrot du Coin', location: { lat: 48.855, lng: 2.3707 } })
/** À 2,3 km de `HERE` */
const FAR = restaurant({ name: 'La Table du Bout', location: { lat: 48.8719, lng: 2.3816 } })
/** Sans coordonnées : jamais dans les résultats « autour de moi » */
const NOWHERE = restaurant({ name: 'Chez Personne' })

const getCurrentPosition = vi.fn()

function allowPosition(coords = HERE) {
  getCurrentPosition.mockImplementation((onSuccess: PositionCallback) =>
    onSuccess({ coords } as GeolocationPosition)
  )
}

function refusePosition() {
  getCurrentPosition.mockImplementation(
    (_onSuccess: PositionCallback, onError: PositionErrorCallback) =>
      onError({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 } as GeolocationPositionError)
  )
}

function renderPicker(initial = page([NOWHERE, CORNER, FAR])) {
  return render(<RestaurantPicker initialPage={initial} value={[]} onChange={vi.fn()} />)
}

describe('RestaurantPicker — autour de moi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    })
  })

  it('should ask for the nearby page and show every distance', async () => {
    allowPosition()
    searchRestaurantsAction.mockResolvedValue({ ok: true, data: page([CORNER, FAR]) })
    renderPicker()

    await userEvent.click(screen.getByRole('button', { name: 'Autour de moi' }))

    await waitFor(() => expect(searchRestaurantsAction).toHaveBeenCalledTimes(1))
    expect(searchRestaurantsAction).toHaveBeenCalledWith({
      query: '',
      offset: 0,
      near: { latitude: 48.853, longitude: 2.369, radiusKm: 5 },
    })
    expect(await screen.findByText('à 240 m')).toBeVisible()
    expect(screen.getByText('à 2,3 km')).toBeVisible()
  })

  it('should never send more than a rounded position', async () => {
    allowPosition({ latitude: 48.8531394, longitude: 2.3691712 })
    searchRestaurantsAction.mockResolvedValue({ ok: true, data: page([CORNER]) })
    renderPicker()

    await userEvent.click(screen.getByRole('button', { name: 'Autour de moi' }))

    await waitFor(() => expect(searchRestaurantsAction).toHaveBeenCalledTimes(1))
    const { near } = searchRestaurantsAction.mock.calls[0][0]
    expect(near.latitude).toBe(48.853)
    expect(near.longitude).toBe(2.369)
  })

  it('should search again within the chosen radius', async () => {
    allowPosition()
    searchRestaurantsAction.mockResolvedValue({ ok: true, data: page([CORNER]) })
    renderPicker()

    await userEvent.click(screen.getByRole('button', { name: 'Autour de moi' }))
    await waitFor(() => expect(searchRestaurantsAction).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('button', { name: '1 km' }))

    await waitFor(() => expect(searchRestaurantsAction).toHaveBeenCalledTimes(2))
    expect(searchRestaurantsAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ near: expect.objectContaining({ radiusKm: 1 }) })
    )
  })

  it('should measure a radius without ever reporting a coordinate', async () => {
    allowPosition()
    searchRestaurantsAction.mockResolvedValue({ ok: true, data: page([CORNER, FAR]) })
    renderPicker()

    await userEvent.click(screen.getByRole('button', { name: 'Autour de moi' }))

    await waitFor(() => expect(captureEvent).toHaveBeenCalledTimes(1))
    expect(captureEvent).toHaveBeenCalledWith('nearby_browsed', { radius_km: 5, results: 2 })
  })

  it('should say the position was refused and leave the catalogue untouched', async () => {
    refusePosition()
    renderPicker()

    await userEvent.click(screen.getByRole('button', { name: 'Autour de moi' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Position refusée')
    expect(searchRestaurantsAction).not.toHaveBeenCalled()
    expect(screen.getByText('Chez Personne')).toBeVisible()
  })

  it('should go back to the whole catalogue when the position is dropped', async () => {
    allowPosition()
    searchRestaurantsAction.mockResolvedValue({ ok: true, data: page([CORNER, FAR]) })
    renderPicker()

    await userEvent.click(screen.getByRole('button', { name: 'Autour de moi' }))
    await waitFor(() => expect(searchRestaurantsAction).toHaveBeenCalledTimes(1))

    searchRestaurantsAction.mockResolvedValue({ ok: true, data: page([NOWHERE, CORNER, FAR]) })
    await userEvent.click(screen.getByRole('button', { name: 'Revenir à toute la base' }))

    await waitFor(() => expect(searchRestaurantsAction).toHaveBeenCalledTimes(2))
    expect(searchRestaurantsAction.mock.calls[1][0].near).toBeUndefined()
    expect(await screen.findByText('Chez Personne')).toBeVisible()
  })
})
