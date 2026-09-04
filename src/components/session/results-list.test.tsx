// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ResultsList } from './results-list'

import type { SessionResultRow } from '@/data-access/models'

function row(overrides: Partial<SessionResultRow>): SessionResultRow {
  return {
    session_restaurant_id: overrides.session_restaurant_id ?? crypto.randomUUID(),
    restaurant_id: crypto.randomUUID(),
    name: 'Resto',
    cuisine_type: null,
    description: null,
    image_url: null,
    restaurant_position: 0,
    score: 0,
    superlikes: 0,
    likes: 0,
    dislikes: 0,
    super_dislikes: 0,
    votes_count: 0,
    rank: 1,
    ...overrides,
  }
}

describe('ResultsList', () => {
  it('should crown the first row and list the others with their rank', () => {
    render(
      <ResultsList
        participantCount={3}
        results={[
          row({ name: 'Burger & Co', score: 3, superlikes: 1, likes: 1, votes_count: 2, rank: 1 }),
          row({
            name: 'Curry House',
            score: -1,
            super_dislikes: 1,
            likes: 1,
            votes_count: 2,
            rank: 2,
          }),
        ]}
      />
    )
    expect(screen.getByRole('heading', { name: 'Burger & Co' })).toBeInTheDocument()
    expect(screen.getByText(/On mange chez/i)).toBeInTheDocument()
    expect(screen.getByText('Curry House')).toBeInTheDocument()
    expect(screen.getByText('−1')).toBeInTheDocument()
    expect(screen.queryByText(/Égalité parfaite/)).not.toBeInTheDocument()
  })

  it('should announce a perfect tie on rank 1', () => {
    render(
      <ResultsList
        participantCount={2}
        results={[
          row({ name: 'A', score: 2, rank: 1 }),
          row({ name: 'B', score: 2, rank: 1 }),
          row({ name: 'C', score: 0, rank: 3 }),
        ]}
      />
    )
    expect(screen.getByText(/Égalité parfaite avec B/)).toBeInTheDocument()
  })

  it('should render nothing without results', () => {
    const { container } = render(<ResultsList participantCount={0} results={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
