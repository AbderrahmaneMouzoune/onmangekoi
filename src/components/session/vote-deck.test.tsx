// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VoteDeck } from './vote-deck'

import type { Restaurant, SessionRestaurantWithRestaurant } from '@/data-access/models'

vi.mock('@/actions/votes', () => ({ submitVoteAction: vi.fn() }))
vi.mock('@/lib/analytics/client', () => ({ captureEvent: vi.fn() }))

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: crypto.randomUUID(),
    name: 'Sushi Bar Sakura',
    cuisine_type: 'Japonais',
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
    ...overrides,
  }
}

function inSession(r: Restaurant, position: number): SessionRestaurantWithRestaurant {
  return {
    id: crypto.randomUUID(),
    session_id: 'session',
    restaurant_id: r.id,
    position,
    restaurants: r,
  }
}

/** Opéra Garnier, Paris */
const OPERA = { lat: 48.8719, lng: 2.3316 }

describe('VoteDeck', () => {
  beforeEach(() => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: OPERA.lat, longitude: OPERA.lng } } as GeolocationPosition)
    )
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should show the distance on the card once the position is given', async () => {
    const sakura = restaurant({ location: { lat: 48.853, lng: 2.3499 } })
    render(
      <VoteDeck
        sessionId="session"
        restaurants={[inSession(sakura, 0), inSession(restaurant({ name: 'Wok Garden' }), 1)]}
        initialVotedIds={[]}
        initialSuperlikeUsed={false}
        initialSuperDislikeUsed={false}
        onFinished={vi.fn()}
      />
    )
    const card = screen.getByRole('article', { name: /sushi bar sakura/i })
    expect(card).not.toHaveTextContent(/km/)

    await userEvent.click(screen.getByRole('button', { name: /autour de moi/i }))
    expect(card).toHaveTextContent(/2,\d km/)

    // Un second clic oublie la position : la distance disparaît.
    await userEvent.click(screen.getByRole('button', { name: /autour de toi/i }))
    expect(card).not.toHaveTextContent(/km/)
  })
})
