// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SESSION_RULES } from '@/domain/session-rules'

import { VoteDeck } from './vote-deck'

import type { Restaurant, SessionRestaurantWithRestaurant } from '@/data-access/models'

const submitVoteAction = vi.hoisted(() => vi.fn())
const completePlaceAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/votes', () => ({ submitVoteAction }))
vi.mock('@/actions/places', () => ({ completePlaceAction }))
vi.mock('@/lib/analytics/client', () => ({ captureEvent: vi.fn() }))

function restaurant(name: string): Restaurant {
  return {
    id: crypto.randomUUID(),
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
    tags: [],
  }
}

function deckOf(...names: string[]): SessionRestaurantWithRestaurant[] {
  return names.map((name, position) => ({
    id: `sr-${position}`,
    session_id: 'session-1',
    restaurant_id: `r-${position}`,
    position,
    added_at: '2026-09-05T10:00:00Z',
    added_by: 'profile-host',
    restaurants: restaurant(name),
  }))
}

function renderDeck(props: Partial<React.ComponentProps<typeof VoteDeck>> = {}) {
  return render(
    <VoteDeck
      sessionId="session-1"
      restaurants={deckOf('Chez Marcel', 'Sushi Sakura')}
      initialVotedIds={[]}
      rules={DEFAULT_SESSION_RULES}
      initialJokersUsed={{ fav: 0, veto: 0 }}
      lastWins={{}}
      onFinished={vi.fn()}
      {...props}
    />
  )
}

/** Les valeurs envoyées à la base, dans l'ordre. */
function submittedValues(): number[] {
  return submitVoteAction.mock.calls.map((call) => call[0].value)
}

/**
 * Vote au clavier puis attend que la carte suivante soit annoncée : le deck
 * refuse un second vote tant que la carte en cours n'est pas partie.
 */
async function voteWithKey(
  user: ReturnType<typeof userEvent.setup>,
  key: string,
  nextCard: string
): Promise<void> {
  await user.keyboard(key)
  await screen.findByText(nextCard)
}

describe('VoteDeck — clavier', () => {
  beforeEach(() => {
    submitVoteAction.mockReset()
    submitVoteAction.mockResolvedValue({
      ok: true,
      data: { recorded: true, finished: false, skipped: false },
    })
  })

  it('should vote with the digit of each action', async () => {
    const user = userEvent.setup()
    renderDeck({ restaurants: deckOf('A', 'B', 'C', 'D') })

    await voteWithKey(user, '1', 'Veto enregistré. Restaurant 2 sur 4 : B.')
    await voteWithKey(user, '2', 'Bof enregistré. Restaurant 3 sur 4 : C.')
    await voteWithKey(user, '3', 'Ça me va enregistré. Restaurant 4 sur 4 : D.')
    await user.keyboard('4')
    await waitFor(() => expect(submitVoteAction).toHaveBeenCalledTimes(4))

    expect(submittedValues()).toEqual([-2, 0, 1, 2])
  })

  it('should vote with the arrows and with Enter', async () => {
    const user = userEvent.setup()
    renderDeck({ restaurants: deckOf('A', 'B', 'C') })

    await voteWithKey(user, '{ArrowLeft}', 'Bof enregistré. Restaurant 2 sur 3 : B.')
    await voteWithKey(user, '{ArrowRight}', 'Ça me va enregistré. Restaurant 3 sur 3 : C.')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(submitVoteAction).toHaveBeenCalledTimes(3))

    expect(submittedValues()).toEqual([0, 1, 1])
  })

  it('should not vote twice when Enter activates the focused button', async () => {
    const user = userEvent.setup()
    renderDeck()

    screen.getByRole('button', { name: /coup de cœur/i }).focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(submitVoteAction).toHaveBeenCalledTimes(1))
    expect(submittedValues()).toEqual([2])
  })

  it('should refuse a joker already spent, like the disabled button does', async () => {
    const user = userEvent.setup()
    renderDeck({ initialJokersUsed: { fav: 1, veto: 0 } })

    await user.keyboard('4')

    expect(screen.getByRole('button', { name: /coup de cœur/i })).toBeDisabled()
    expect(submitVoteAction).not.toHaveBeenCalled()
  })

  it('should spend a larger veto quota one vote at a time', async () => {
    const user = userEvent.setup()
    renderDeck({
      restaurants: deckOf('A', 'B', 'C'),
      rules: { superlikes: 1, vetos: 2, close_at_ratio: 1 },
    })

    expect(screen.getByRole('button', { name: /veto/i })).toHaveTextContent(/2 restants/)
    await voteWithKey(user, '1', 'Veto enregistré. Restaurant 2 sur 3 : B.')
    expect(screen.getByRole('button', { name: /veto/i })).toHaveTextContent(/1 restant/)
    await voteWithKey(user, '1', 'Veto enregistré. Restaurant 3 sur 3 : C.')

    const veto = screen.getByRole('button', { name: /veto/i })
    expect(veto).toBeDisabled()
    expect(veto).toHaveTextContent(/épuisé/)

    await user.keyboard('1')
    expect(submitVoteAction).toHaveBeenCalledTimes(2)
  })

  it('should keep a joker the session put out of play unusable', async () => {
    const user = userEvent.setup()
    renderDeck({ rules: { superlikes: 0, vetos: 1, close_at_ratio: 1 } })

    await user.keyboard('4')

    expect(screen.getByRole('button', { name: /coup de cœur/i })).toBeDisabled()
    expect(submitVoteAction).not.toHaveBeenCalled()
  })

  it('should keep its shortcuts on the buttons for assistive tech', () => {
    renderDeck()
    expect(screen.getByRole('button', { name: /veto/i })).toHaveAttribute('aria-keyshortcuts', '1')
    expect(screen.getByRole('button', { name: /ça me va/i })).toHaveAttribute(
      'aria-keyshortcuts',
      '3 ArrowRight Enter'
    )
  })
})

describe('VoteDeck — annonce', () => {
  beforeEach(() => {
    submitVoteAction.mockReset()
    submitVoteAction.mockResolvedValue({
      ok: true,
      data: { recorded: true, finished: false, skipped: false },
    })
  })

  it('should announce the current restaurant and its position', async () => {
    renderDeck()
    await waitFor(() =>
      expect(screen.getByText('Restaurant 1 sur 2 : Chez Marcel.')).toBeInTheDocument()
    )
  })

  it('should announce the recorded vote then the next restaurant', async () => {
    const user = userEvent.setup()
    renderDeck()

    await user.keyboard('{ArrowRight}')

    await waitFor(() =>
      expect(
        screen.getByText('Ça me va enregistré. Restaurant 2 sur 2 : Sushi Sakura.')
      ).toBeInTheDocument()
    )
  })

  it('should hold the announcement in a polite live region', async () => {
    renderDeck()
    const live = await screen.findByText(/Restaurant 1 sur 2/)
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveAttribute('aria-atomic', 'true')
  })
})

describe('VoteDeck — distance', () => {
  /** Opéra Garnier, Paris */
  const OPERA = { latitude: 48.8719, longitude: 2.3316 }

  beforeEach(() => {
    submitVoteAction.mockReset()
    const getCurrentPosition = vi.fn((onSuccess: PositionCallback) =>
      onSuccess({ coords: OPERA } as GeolocationPosition)
    )
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    })
  })

  it('should show the distance on the card once the position is given, and forget it on a second click', async () => {
    const user = userEvent.setup()
    const deck = deckOf('Chez Marcel', 'Sushi Sakura')
    // Notre-Dame : environ 2,4 km de l'Opéra.
    deck[0]!.restaurants!.location = { lat: 48.853, lng: 2.3499 }
    renderDeck({ restaurants: deck })

    const card = screen.getByRole('article', { name: /chez marcel/i })
    expect(card).not.toHaveTextContent(/km/)

    await user.click(screen.getByRole('button', { name: 'Autour de moi' }))
    expect(card).toHaveTextContent(/2,\d km/)

    await user.click(screen.getByRole('button', { name: 'Autour de toi' }))
    expect(card).not.toHaveTextContent(/km/)
  })
})

describe('VoteDeck — fiche complétée à l’affichage', () => {
  /** Un resto amorcé en masse : Google le connaît, sa fiche n'a pas de photo. */
  function seeded(name: string, placeId: string): SessionRestaurantWithRestaurant[] {
    const deck = deckOf(name, 'Sushi Sakura')
    deck[0]!.restaurants!.place_id = placeId
    deck[0]!.restaurants!.source = 'google'
    return deck
  }

  beforeEach(() => {
    submitVoteAction.mockReset()
    completePlaceAction.mockReset()
    completePlaceAction.mockImplementation(async (placeId: string) => ({
      ok: true,
      data: { ...restaurant('Chez Marcel'), place_id: placeId, photo_url: null },
    }))
  })

  it('should pay the details of the card on screen, once, and not those of the deck below', async () => {
    renderDeck({ restaurants: seeded('Chez Marcel', 'ChIJmarcel') })

    await waitFor(() => expect(completePlaceAction).toHaveBeenCalledWith('ChIJmarcel'))
    expect(completePlaceAction).toHaveBeenCalledTimes(1)
  })

  it('should leave alone a restaurant that never came from Google', async () => {
    renderDeck({ restaurants: deckOf('Chez Marcel', 'Sushi Sakura') })

    await screen.findByText(/Restaurant 1 sur 2/)
    expect(completePlaceAction).not.toHaveBeenCalled()
  })
})
