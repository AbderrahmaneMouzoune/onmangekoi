// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RestaurantPicker } from './restaurant-picker'

import type { Restaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'

const searchRestaurantsAction = vi.hoisted(() => vi.fn())
const createRestaurantAction = vi.hoisted(() => vi.fn())
const findSimilarRestaurantsAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/restaurants', () => ({
  searchRestaurantsAction,
  createRestaurantAction,
  findSimilarRestaurantsAction,
}))
// Le sélecteur monte aussi l'onglet Google, dont l'action tire `server-only`.
vi.mock('@/actions/places', () => ({ importPlaceAction: vi.fn() }))

const SAKURA = '11111111-1111-4111-8111-111111111111'
const TRATTORIA = '22222222-2222-4222-8222-222222222222'

function restaurant(id: string, name: string): Restaurant {
  return {
    id,
    name,
    cuisine_type: null,
    description: null,
    address: null,
    city: null,
    photo_url: null,
    website: null,
    location: null,
    opening_hours: null,
    created_at: '2026-09-05T10:00:00Z',
    created_by: null,
    source: 'seed',
    price_level: null,
    place_id: null,
  }
}

const PAGE: RestaurantPage = {
  items: [restaurant(SAKURA, 'Sushi Bar Sakura'), restaurant(TRATTORIA, 'La Trattoria Roma')],
  hasMore: false,
  nextOffset: 2,
}

/** Sakura a gagné il y a six jours ; la Trattoria, jamais. */
const RECENT = { [SAKURA]: '2026-09-12T12:00:00Z' }

function renderPicker(props: Partial<React.ComponentProps<typeof RestaurantPicker>> = {}) {
  const onChange = vi.fn()
  render(<RestaurantPicker initialPage={PAGE} value={[]} onChange={onChange} {...props} />)
  return { onChange }
}

describe('RestaurantPicker — anti-fatigue', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-18T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should badge a restaurant that won lately', () => {
    renderPicker({ recentWinners: RECENT })
    expect(screen.getByText('Gagnant il y a 6 jours')).toBeInTheDocument()
  })

  it('should say nothing when nothing has won lately', () => {
    renderPicker()
    expect(screen.queryByText(/Gagnant/)).not.toBeInTheDocument()
  })

  it('should let a recent winner be picked while the anti-fatigue is off', async () => {
    const user = userEvent.setup()
    const { onChange } = renderPicker({ recentWinners: RECENT })

    await user.click(screen.getByRole('checkbox', { name: /Sushi Bar Sakura/ }))

    expect(onChange).toHaveBeenCalledWith([SAKURA])
  })

  it('should set aside a recent winner once the anti-fatigue is on', async () => {
    const user = userEvent.setup()
    const { onChange } = renderPicker({
      recentWinners: RECENT,
      excludeRecent: true,
      value: [SAKURA],
    })

    const row = screen.getByRole('checkbox', { name: /Sushi Bar Sakura/ })
    expect(row).toHaveAttribute('aria-checked', 'false')
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Écarté')).toBeInTheDocument()

    await user.click(row)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('should leave the others alone', async () => {
    const user = userEvent.setup()
    const { onChange } = renderPicker({ recentWinners: RECENT, excludeRecent: true })

    await user.click(screen.getByRole('checkbox', { name: /La Trattoria Roma/ }))

    expect(onChange).toHaveBeenCalledWith([TRATTORIA])
  })
})
