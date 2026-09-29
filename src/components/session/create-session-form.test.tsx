// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { CreateSessionForm } from './create-session-form'

import type { Restaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'
import type { RestaurantSuggestion } from '@/domain/suggestions'

const createSessionAction = vi.hoisted(() => vi.fn())
const rememberSessionEntry = vi.hoisted(() => vi.fn())

vi.mock('@/actions/sessions', () => ({ createSessionAction }))
vi.mock('@/actions/restaurants', () => ({
  searchRestaurantsAction: vi.fn(),
  createRestaurantAction: vi.fn(),
  findSimilarRestaurantsAction: vi.fn(),
}))
vi.mock('@/actions/places', () => ({
  importPlaceAction: vi.fn(),
  seedNeighbourhoodAction: vi.fn(),
}))
vi.mock('@/lib/analytics/client', () => ({ captureEvent: vi.fn() }))
vi.mock('@/lib/analytics/handoff', () => ({ rememberSessionEntry }))

function restaurant(name: string): Restaurant {
  return {
    id: crypto.randomUUID(),
    name,
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
    source: 'seed',
    price_level: null,
    place_id: null,
    tags: [],
  }
}

const MARCEL = restaurant('Chez Marcel')
const SAKURA = restaurant('Sakura')
/** Hors de la première page du carnet : le panier doit pourtant le nommer. */
const PHO = restaurant('Pho 13')
const PAGE: RestaurantPage = { items: [MARCEL, SAKURA], hasMore: false, nextOffset: 2 }

const SUGGESTION: RestaurantSuggestion = {
  restaurants: [MARCEL, PHO],
  recentCount: 1,
  excludedWinners: 2,
  fresh: 'catalog',
}

function renderForm(suggestion: RestaurantSuggestion | null = null) {
  return renderWithIntl(
    <CreateSessionForm
      lists={[]}
      groups={[]}
      initialPage={PAGE}
      defaultName="Déj du mardi"
      recentWinners={{}}
      suggestion={suggestion}
    />
  )
}

function hiddenValues(name: string): string[] {
  return [
    ...document.querySelectorAll<HTMLInputElement>(`input[type="hidden"][name="${name}"]`),
  ].map((input) => input.value)
}

describe('CreateSessionForm — sélection proposée', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should start from an empty basket when there is no history', () => {
    renderForm(null)

    expect(screen.queryByRole('complementary', { name: 'Sélection proposée' })).toBeNull()
    expect(hiddenValues('restaurantIds')).toEqual([])
    expect(screen.getByRole('button', { name: 'Sélectionne des restaurants' })).toBeDisabled()
  })

  it('should pre-check the proposal and say where it comes from', () => {
    renderForm(SUGGESTION)

    const notice = screen.getByRole('complementary', { name: 'Sélection proposée' })
    expect(notice).toHaveTextContent(
      'Vu récemment, sans les 2 gagnants des 30 derniers jours — plus un jamais proposé, le dernier arrivé au carnet.'
    )
    expect(hiddenValues('restaurantIds')).toEqual([MARCEL.id, PHO.id])

    const basket = screen.getByRole('region', { name: 'Ta sélection' })
    expect(within(basket).getByRole('button', { name: 'Retirer Pho 13' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /créer la session · 2 restos/i })).toBeEnabled()
  })

  it('should drop the whole proposal at once, and keep what the person added', async () => {
    renderForm(SUGGESTION)

    await userEvent.click(screen.getByRole('checkbox', { name: /Sakura/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Repartir de zéro' }))

    expect(hiddenValues('restaurantIds')).toEqual([SAKURA.id])
    expect(screen.queryByRole('complementary', { name: 'Sélection proposée' })).toBeNull()
  })

  it('should report how many proposed restaurants were kept', async () => {
    createSessionAction.mockResolvedValue(null)
    renderForm(SUGGESTION)

    await userEvent.click(screen.getByRole('button', { name: 'Retirer Pho 13' }))
    await userEvent.click(screen.getByRole('button', { name: /créer la session · 1 resto/i }))

    expect(rememberSessionEntry).toHaveBeenCalledWith({
      kind: 'created',
      listCount: 0,
      suggestedCount: 2,
      suggestedKept: 1,
    })
  })
})
