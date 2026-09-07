// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VoteDeck } from './vote-deck'

import type { SessionRestaurantWithRestaurant } from '@/data-access/models'

const submitVoteAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/votes', () => ({ submitVoteAction }))

function entry(name: string): SessionRestaurantWithRestaurant {
  const id = crypto.randomUUID()
  return {
    id,
    session_id: 'session',
    restaurant_id: id,
    position: 0,
    restaurants: {
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
    },
  } as SessionRestaurantWithRestaurant
}

function renderDeck(overrides: Partial<React.ComponentProps<typeof VoteDeck>> = {}) {
  return render(
    <VoteDeck
      sessionId="session"
      restaurants={[entry('Chez Marcel'), entry('Sushi Bar Sakura')]}
      initialVotedIds={[]}
      initialSuperlikeUsed={false}
      initialSuperDislikeUsed={false}
      onFinished={vi.fn()}
      {...overrides}
    />
  )
}

describe('VoteDeck', () => {
  beforeEach(() => {
    submitVoteAction.mockReset()
    submitVoteAction.mockResolvedValue({ ok: true, data: { recorded: true, finished: false } })
  })

  it('should announce the current card to screen readers', () => {
    renderDeck()
    expect(screen.getByText('Restaurant 1 sur 2 : Chez Marcel')).toBeInTheDocument()
  })

  it('should vote with the arrow keys', async () => {
    const user = userEvent.setup()
    renderDeck()

    await user.keyboard('{ArrowRight}')
    expect(submitVoteAction).toHaveBeenLastCalledWith(expect.objectContaining({ value: 1 }))
  })

  it('should spend the jokers with up and down', async () => {
    const user = userEvent.setup()
    renderDeck()

    await user.keyboard('{ArrowUp}')
    expect(submitVoteAction).toHaveBeenLastCalledWith(expect.objectContaining({ value: 2 }))
  })

  it('should ignore a joker key once the joker is spent', async () => {
    const user = userEvent.setup()
    renderDeck({ initialSuperDislikeUsed: true })

    await user.keyboard('{ArrowDown}')
    expect(submitVoteAction).not.toHaveBeenCalled()
  })

  it('should leave the keys to a field being typed in', async () => {
    const user = userEvent.setup()
    render(
      <>
        <input aria-label="Champ" />
        <VoteDeck
          sessionId="session"
          restaurants={[entry('Chez Marcel')]}
          initialVotedIds={[]}
          initialSuperlikeUsed={false}
          initialSuperDislikeUsed={false}
          onFinished={vi.fn()}
        />
      </>
    )

    await user.click(screen.getByRole('textbox', { name: 'Champ' }))
    await user.keyboard('{ArrowLeft}')
    expect(submitVoteAction).not.toHaveBeenCalled()
  })

  it('should not fire twice while the card is still leaving', async () => {
    const user = userEvent.setup()
    renderDeck()

    await user.keyboard('{ArrowRight}')
    await user.keyboard('{ArrowLeft}')
    expect(submitVoteAction).toHaveBeenCalledTimes(1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
  })
})
