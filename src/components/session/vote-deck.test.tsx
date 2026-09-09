// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VoteDeck } from './vote-deck'

import type { Restaurant, SessionRestaurantWithRestaurant } from '@/data-access/models'

const submitVoteAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/votes', () => ({ submitVoteAction }))
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
  }
}

function deckOf(...names: string[]): SessionRestaurantWithRestaurant[] {
  return names.map((name, position) => ({
    id: `sr-${position}`,
    session_id: 'session-1',
    restaurant_id: `r-${position}`,
    position,
    restaurants: restaurant(name),
  }))
}

function renderDeck(props: Partial<React.ComponentProps<typeof VoteDeck>> = {}) {
  return render(
    <VoteDeck
      sessionId="session-1"
      restaurants={deckOf('Chez Marcel', 'Sushi Sakura')}
      initialVotedIds={[]}
      initialSuperlikeUsed={false}
      initialSuperDislikeUsed={false}
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
    renderDeck({ initialSuperlikeUsed: true })

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
