// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VoteCard } from './vote-card'

import type { Restaurant } from '@/data-access/models'

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
    ...overrides,
  }
}

const LUNCH = { periods: [{ day: 1, open: '11:30', close: '14:30' }] }

describe('VoteCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Lundi 2026-09-07, 12:30 — en plein service
    vi.setSystemTime(new Date(2026, 8, 7, 12, 30))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should show the address when it is known', () => {
    render(
      <VoteCard
        restaurant={restaurant({ address: '12 rue de la Paix', city: 'Paris' })}
        index={1}
        total={3}
      />
    )
    expect(screen.getByText('12 rue de la Paix, Paris')).toBeInTheDocument()
  })

  it('should badge a restaurant open right now', () => {
    render(<VoteCard restaurant={restaurant({ opening_hours: LUNCH })} index={1} total={3} />)
    expect(screen.getByText('Ouvert')).toBeInTheDocument()
  })

  it('should badge a restaurant closed right now', () => {
    vi.setSystemTime(new Date(2026, 8, 7, 17, 0))
    render(<VoteCard restaurant={restaurant({ opening_hours: LUNCH })} index={1} total={3} />)
    expect(screen.getByText('Fermé')).toBeInTheDocument()
  })

  it('should say nothing about hours it does not have', () => {
    render(<VoteCard restaurant={restaurant()} index={1} total={3} />)
    expect(screen.queryByText('Ouvert')).not.toBeInTheDocument()
    expect(screen.queryByText('Fermé')).not.toBeInTheDocument()
  })

  it('should render the photo of an allowed host as a decorative background', () => {
    render(
      <VoteCard
        restaurant={restaurant({ photo_url: 'https://lh3.googleusercontent.com/a/photo.jpg' })}
        index={1}
        total={3}
      />
    )
    // `alt=""` : la photo est décorative, le nom porte déjà l'information
    const image = document.querySelector('img')
    expect(image).not.toBeNull()
    expect(image).toHaveAttribute('alt', '')
  })

  it('should fall back to the chalkboard rather than render a foreign host', () => {
    render(
      <VoteCard
        restaurant={restaurant({ photo_url: 'https://evil.test/photo.jpg' })}
        index={1}
        total={3}
      />
    )
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Sushi Bar Sakura' })).toBeInTheDocument()
  })
})
