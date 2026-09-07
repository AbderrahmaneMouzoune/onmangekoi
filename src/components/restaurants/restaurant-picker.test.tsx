// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RestaurantPicker } from './restaurant-picker'

import type { Restaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'

const searchRestaurantsAction = vi.hoisted(() => vi.fn())
vi.mock('@/actions/restaurants', () => ({
  searchRestaurantsAction,
  createRestaurantAction: vi.fn(),
  findSimilarRestaurantsAction: vi.fn(),
}))
// L'onglet Google importe l'action serveur : elle n'a rien à faire ici.
vi.mock('@/actions/places', () => ({ importPlaceAction: vi.fn() }))

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: crypto.randomUUID(),
    name: 'Sushi Bar Sakura',
    cuisine_type: 'Japonais',
    address: null,
    city: null,
    description: null,
    photo_url: null,
    website: null,
    location: null,
    opening_hours: null,
    created_at: '2026-09-05T10:00:00Z',
    created_by: null,
    source: 'seed',
    price_level: null,
    place_id: null,
    ...overrides,
  }
}

/** Opéra Garnier, Paris */
const OPERA = { lat: 48.8719, lng: 2.3316 }

const SAKURA = restaurant({ name: 'Sushi Bar Sakura', location: { lat: 48.853, lng: 2.3499 } })
const LIBANAIS = restaurant({ name: 'Le Petit Libanais', cuisine_type: 'Libanais', city: 'Paris' })
const WOK = restaurant({ name: 'Wok Garden', cuisine_type: 'Chinois' })

function page(items: Restaurant[]): RestaurantPage {
  return { items, hasMore: false, nextOffset: items.length }
}

/** Sélecteur contrôlé, comme dans les formulaires qui l'utilisent. */
function Harness({ initial = [SAKURA, LIBANAIS, WOK], locked = [] as string[] }) {
  const [value, setValue] = useState<string[]>([])
  return (
    <RestaurantPicker
      initialPage={page(initial)}
      value={value}
      onChange={setValue}
      lockedIds={locked}
    />
  )
}

describe('RestaurantPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchRestaurantsAction.mockResolvedValue({ ok: true, data: page([SAKURA, LIBANAIS, WOK]) })
    Element.prototype.scrollTo = vi.fn()
  })

  it('should render each restaurant as an illustrated card with its facts', () => {
    render(<Harness />)
    const results = screen.getByRole('list', { name: 'Résultats' })
    const card = within(results).getByRole('checkbox', { name: /le petit libanais/i })
    expect(card).toHaveTextContent('Libanais')
    expect(card).toHaveTextContent('Paris')
    expect(card).toHaveAttribute('aria-checked', 'false')
  })

  it('should keep the selection on a single scrolling strip instead of stacking chips', async () => {
    render(<Harness />)
    const results = screen.getByRole('list', { name: 'Résultats' })

    await userEvent.click(within(results).getByRole('checkbox', { name: /sakura/i }))
    await userEvent.click(within(results).getByRole('checkbox', { name: /libanais/i }))
    await userEvent.click(within(results).getByRole('checkbox', { name: /wok/i }))

    const strip = screen.getByRole('list', { name: 'Restaurants sélectionnés' })
    expect(within(strip).getAllByRole('listitem')).toHaveLength(3)
    expect(strip).toHaveClass('overflow-x-auto')
    expect(strip).not.toHaveClass('flex-wrap')
    expect(screen.getByText('3 choisis')).toBeInTheDocument()
    // Le dernier choisi est amené dans le champ de vision de la bande.
    expect(Element.prototype.scrollTo).toHaveBeenCalled()
  })

  it('should remove one restaurant from the strip, or all of them at once', async () => {
    render(<Harness />)
    const results = screen.getByRole('list', { name: 'Résultats' })
    await userEvent.click(within(results).getByRole('checkbox', { name: /sakura/i }))
    await userEvent.click(within(results).getByRole('checkbox', { name: /wok/i }))

    await userEvent.click(screen.getByRole('button', { name: 'Retirer Sushi Bar Sakura' }))
    expect(within(results).getByRole('checkbox', { name: /sakura/i })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    expect(screen.getByText('1 choisi')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /tout retirer/i }))
    expect(screen.queryByRole('list', { name: 'Restaurants sélectionnés' })).not.toBeInTheDocument()
  })

  it('should show a locked restaurant as checked but leave it out of the selection', async () => {
    render(<Harness locked={[WOK.id]} />)
    const results = screen.getByRole('list', { name: 'Résultats' })
    const wok = within(results).getByRole('checkbox', { name: /wok/i })
    expect(wok).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(wok)
    expect(screen.queryByRole('list', { name: 'Restaurants sélectionnés' })).not.toBeInTheDocument()
  })

  it('should show the distance of each located restaurant once the position is given', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: OPERA.lat, longitude: OPERA.lng } } as GeolocationPosition)
    )
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })

    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /autour de moi/i }))

    const results = screen.getByRole('list', { name: 'Résultats' })
    expect(within(results).getByRole('checkbox', { name: /sakura/i })).toHaveTextContent(/2,\d km/)
    // Sans coordonnées, pas de distance inventée.
    expect(within(results).getByRole('checkbox', { name: /wok/i })).not.toHaveTextContent(/km|m$/)
    expect(screen.getByRole('button', { name: /autour de toi/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    vi.unstubAllGlobals()
  })

  it('should say so when the position is refused', async () => {
    const getCurrentPosition = vi.fn((_: PositionCallback, failure?: PositionErrorCallback) =>
      failure?.({ code: 1, message: 'denied' } as GeolocationPositionError)
    )
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })

    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /autour de moi/i }))

    expect(screen.getByRole('status')).toHaveTextContent(/position refusée/i)

    vi.unstubAllGlobals()
  })
})
