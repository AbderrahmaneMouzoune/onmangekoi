// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RestaurantPicker } from './restaurant-picker'

import type { Restaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'

// L'import de restaurant Google traverse la passerelle serveur : sous Vitest
// on neutralise son marqueur, comme le fait Next avec la condition
// `react-server`.
vi.mock('server-only', () => ({}))

const searchRestaurantsAction = vi.hoisted(() => vi.fn())
const geolocation = vi.hoisted(() => ({ status: 'unsupported', position: null, request: vi.fn() }))

vi.mock('@/actions/restaurants', () => ({
  searchRestaurantsAction,
  createRestaurantAction: vi.fn(),
  findSimilarRestaurantsAction: vi.fn().mockResolvedValue({ ok: true, data: [] }),
}))
vi.mock('@/hooks/use-geolocation', () => ({ useGeolocation: () => geolocation }))

function restaurant(name: string, overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: name.toLowerCase().replace(/\s/g, '-'),
    name,
    cuisine_type: null,
    description: null,
    address: null,
    city: null,
    photo_url: null,
    website: null,
    location: null,
    opening_hours: null,
    created_at: '2026-09-18T10:00:00Z',
    created_by: null,
    source: 'seed',
    price_level: null,
    place_id: null,
    tags: [],
    ...overrides,
  }
}

function pageOf(names: string[], hasMore = false, nextOffset = names.length): RestaurantPage {
  return { items: names.map((name) => restaurant(name)), hasMore, nextOffset }
}

/**
 * Le sélecteur est rendu hors de tout formulaire : les filtres n'ont donc
 * personne à qui rendre compte, ce qui est exactement le cas des listes.
 */
function setup(initialPage: RestaurantPage) {
  render(<RestaurantPicker initialPage={initialPage} value={[]} onChange={vi.fn()} />)
}

describe('RestaurantPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should trust the page the server already filtered instead of asking again', async () => {
    setup(pageOf(['Wok Garden']))

    expect(await screen.findByText('Wok Garden')).toBeInTheDocument()
    expect(searchRestaurantsAction).not.toHaveBeenCalled()
  })

  it('should restart from the first page when a filter changes', async () => {
    searchRestaurantsAction.mockResolvedValue({ ok: true, data: pageOf(['Green Bowl']) })
    setup(pageOf(['Wok Garden', 'Green Bowl']))

    await userEvent.click(screen.getByRole('checkbox', { name: 'Vegan' }))

    await waitFor(() =>
      expect(searchRestaurantsAction).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['vegan'], offset: 0 })
      )
    )
    expect(await screen.findByText('Green Bowl')).toBeInTheDocument()
    expect(screen.queryByText('Wok Garden')).not.toBeInTheDocument()
  })

  it('should keep the filters on the next page', async () => {
    searchRestaurantsAction.mockResolvedValue({
      ok: true,
      data: pageOf(['Green Bowl'], true, 1),
    })
    setup(pageOf(['Wok Garden']))

    await userEvent.click(screen.getByRole('radio', { name: 'Budget maximum €' }))
    await waitFor(() => expect(searchRestaurantsAction).toHaveBeenCalledTimes(1))

    searchRestaurantsAction.mockResolvedValue({ ok: true, data: pageOf(['Sushi Ya'], false, 2) })
    await userEvent.click(screen.getByRole('button', { name: /afficher plus/i }))

    // Même filtre, page suivante : c'est la base qui pagine le résultat filtré.
    await waitFor(() =>
      expect(searchRestaurantsAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ priceMax: 1, offset: 1 })
      )
    )
    expect(await screen.findByText('Sushi Ya')).toBeInTheDocument()
    expect(screen.getByText('Green Bowl')).toBeInTheDocument()
  })

  it('should offer to clear the filters when they empty the list', async () => {
    searchRestaurantsAction.mockResolvedValue({ ok: true, data: pageOf([]) })
    setup(pageOf(['Wok Garden']))

    await userEvent.click(screen.getByRole('checkbox', { name: 'Casher' }))

    expect(await screen.findByRole('button', { name: /efface les filtres/i })).toBeInTheDocument()
  })
})
