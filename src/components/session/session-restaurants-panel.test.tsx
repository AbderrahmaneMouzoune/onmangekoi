// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionRestaurantsPanel } from './session-restaurants-panel'

import type { ParticipantWithProfile, SessionRestaurantWithRestaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'

const addSessionRestaurantsAction = vi.hoisted(() => vi.fn())
const removeSessionRestaurantAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/sessions', () => ({
  addSessionRestaurantsAction,
  removeSessionRestaurantAction,
}))

vi.mock('@/lib/analytics/client', () => ({ captureEvent: vi.fn() }))

// Le sélecteur a sa propre couverture : ici il ne sert qu'à produire une
// sélection, sans traîner ses recherches serveur dans le test.
vi.mock('@/components/restaurants/restaurant-picker', () => ({
  RestaurantPicker: ({ onChange }: { onChange: (ids: string[]) => void }) => (
    <button type="button" onClick={() => onChange(['resto-3'])}>
      Choisir un resto
    </button>
  ),
}))

const ME = 'profile-me'
const OTHER = 'profile-other'

function participant(profileId: string, pseudo: string): ParticipantWithProfile {
  return {
    id: `participant-${profileId}`,
    session_id: 'session-1',
    profile_id: profileId,
    joined_at: new Date().toISOString(),
    has_finished_voting: false,
    superlike_used: false,
    super_dislike_used: false,
    profiles: { id: profileId, pseudo },
  }
}

function row(
  id: string,
  name: string,
  addedBy: string | null,
  position: number
): SessionRestaurantWithRestaurant {
  return {
    id: `sr-${id}`,
    session_id: 'session-1',
    restaurant_id: id,
    position,
    added_at: new Date().toISOString(),
    added_by: addedBy,
    restaurants: {
      id,
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
    },
  }
}

const CATALOG: RestaurantPage = { items: [], hasMore: false, nextOffset: 0 }

const PARTICIPANTS = [participant(ME, 'Alex'), participant(OTHER, 'Sam')]
const RESTAURANTS = [
  row('resto-1', 'Sushi Bar Sakura', ME, 0),
  row('resto-2', 'Pizza Napolitana', OTHER, 1),
]

function renderPanel(props: Partial<Parameters<typeof SessionRestaurantsPanel>[0]> = {}) {
  const onChanged = vi.fn()
  render(
    <SessionRestaurantsPanel
      sessionId="session-1"
      restaurants={RESTAURANTS}
      participants={PARTICIPANTS}
      meId={ME}
      isHost={false}
      initialPage={CATALOG}
      onChanged={onChanged}
      {...props}
    />
  )
  return { onChanged }
}

describe('SessionRestaurantsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addSessionRestaurantsAction.mockResolvedValue({ ok: true, data: undefined })
    removeSessionRestaurantAction.mockResolvedValue({ ok: true, data: undefined })
  })

  it('should say who brought each restaurant', () => {
    renderPanel()
    expect(screen.getByText('Ajouté par toi')).toBeInTheDocument()
    expect(screen.getByText('Ajouté par Sam')).toBeInTheDocument()
  })

  it('should only offer to remove what I brought', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /retirer sushi bar sakura/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retirer pizza napolitana/i })).toBeNull()
  })

  it('should let the host remove any restaurant', () => {
    renderPanel({ isHost: true })
    expect(screen.getByRole('button', { name: /retirer pizza napolitana/i })).toBeInTheDocument()
  })

  it('should never offer to remove the last restaurant', () => {
    renderPanel({ isHost: true, restaurants: [RESTAURANTS[0]!] })
    expect(screen.queryByRole('button', { name: /retirer/i })).toBeNull()
  })

  it('should remove a restaurant and resync the room', async () => {
    const { onChanged } = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /retirer sushi bar sakura/i }))

    await waitFor(() =>
      expect(removeSessionRestaurantAction).toHaveBeenCalledWith('session-1', 'resto-1')
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('should add the picked restaurants and resync the room', async () => {
    const { onChanged } = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /ajouter le mien/i }))
    await userEvent.click(screen.getByRole('button', { name: /choisir un resto/i }))
    await userEvent.click(screen.getByRole('button', { name: /^ajouter 1 resto$/i }))

    await waitFor(() =>
      expect(addSessionRestaurantsAction).toHaveBeenCalledWith('session-1', ['resto-3'])
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('should surface a refused removal instead of pretending it worked', async () => {
    removeSessionRestaurantAction.mockResolvedValue({
      ok: false,
      error: 'Tu ne peux retirer que les restos que tu as ajoutés.',
    })
    const { onChanged } = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /retirer sushi bar sakura/i }))

    expect(
      await screen.findByText('Tu ne peux retirer que les restos que tu as ajoutés.')
    ).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('should hide the add form when the catalogue was not loaded', () => {
    renderPanel({ initialPage: null })
    expect(screen.queryByRole('button', { name: /ajouter le mien/i })).toBeNull()
    expect(screen.getByText('Sushi Bar Sakura')).toBeInTheDocument()
  })
})
