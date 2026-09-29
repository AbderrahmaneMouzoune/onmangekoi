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
    photo_url: null,
    address: null,
    city: null,
    website: null,
    location: null,
    opening_hours: null,
    restaurant_position: 0,
    score: 0,
    superlikes: 0,
    likes: 0,
    dislikes: 0,
    super_dislikes: 0,
    votes_count: 0,
    rank: 1,
    tiebreak: null,
    decided: false,
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
          row({ name: 'A', score: 2, rank: 1, tiebreak: 'tied' }),
          row({ name: 'B', score: 2, rank: 1, tiebreak: 'tied' }),
          row({ name: 'C', score: 0, rank: 3 }),
        ]}
      />
    )
    expect(screen.getByText(/Égalité parfaite avec B\./)).toBeInTheDocument()
  })

  it('should say when the draw picked the winner', () => {
    render(
      <ResultsList
        participantCount={2}
        results={[
          row({ name: 'A', score: 2, rank: 1, tiebreak: 'winner' }),
          row({ name: 'B', score: 2, rank: 2, tiebreak: 'loser' }),
        ]}
      />
    )
    expect(
      screen.getByText(/Désigné par tirage au sort, à égalité parfaite avec B/)
    ).toBeInTheDocument()
  })

  it('should say when a runoff is under way', () => {
    render(
      <ResultsList
        participantCount={2}
        results={[
          row({ name: 'A', score: 2, rank: 1, tiebreak: 'runoff' }),
          row({ name: 'B', score: 2, rank: 1, tiebreak: 'runoff' }),
        ]}
      />
    )
    expect(screen.getByText(/le second tour est en cours/)).toBeInTheDocument()
  })

  it('should offer directions and a map for a located winner', () => {
    render(
      <ResultsList
        participantCount={2}
        results={[
          row({
            name: 'Burger & Co',
            address: '12 rue de la Paix',
            city: 'Paris',
            location: { lat: 48.8719, lng: 2.3316 },
            website: 'https://burger.test',
            rank: 1,
          }),
        ]}
      />
    )
    expect(screen.getByRole('link', { name: /Itinéraire/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=48.8719%2C2.3316'
    )
    expect(screen.getByRole('link', { name: /Le site/ })).toHaveAttribute(
      'href',
      'https://burger.test'
    )
    expect(screen.getByText('12 rue de la Paix, Paris')).toBeInTheDocument()
    // 2×2 tuiles OpenStreetMap
    expect(document.querySelectorAll('img')).toHaveLength(4)
  })

  it('should stay silent about a winner it cannot locate', () => {
    render(<ResultsList participantCount={2} results={[row({ name: 'Burger & Co', rank: 1 })]} />)
    expect(screen.queryByRole('link', { name: /Itinéraire/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Le site/ })).not.toBeInTheDocument()
    expect(document.querySelectorAll('img')).toHaveLength(0)
  })

  it('should put the host’s decision on the card and keep the vote below', () => {
    render(
      <ResultsList
        participantCount={3}
        results={[
          row({ name: 'Burger & Co', score: 3, rank: 1 }),
          row({ name: 'Chez Marcel', score: 1, rank: 2, decided: true }),
        ]}
      />
    )
    expect(screen.getByRole('heading', { name: 'Chez Marcel' })).toBeInTheDocument()
    expect(screen.getByText(/C’est décidé · on mange chez/)).toBeInTheDocument()
    expect(
      screen.getByText('Choix du host : le vote plaçait Burger & Co en tête.')
    ).toBeInTheDocument()
    // Le premier du vote reste au classement, à son rang.
    expect(screen.getByText('Burger & Co')).toBeInTheDocument()
    expect(screen.getByText('1.')).toBeInTheDocument()
  })

  it('should not second-guess the vote when the host confirms the winner', () => {
    render(
      <ResultsList
        participantCount={3}
        results={[
          row({ name: 'Burger & Co', score: 3, rank: 1, decided: true }),
          row({ name: 'Curry House', score: 1, rank: 2 }),
        ]}
      />
    )
    expect(screen.getByRole('heading', { name: 'Burger & Co' })).toBeInTheDocument()
    expect(screen.getByText(/C’est décidé/)).toBeInTheDocument()
    expect(screen.queryByText(/Choix du host/)).not.toBeInTheDocument()
  })

  it('should say the host settled a tie by picking one of the tied', () => {
    render(
      <ResultsList
        participantCount={2}
        results={[
          row({ name: 'A', score: 2, rank: 1, tiebreak: 'tied' }),
          row({ name: 'B', score: 2, rank: 1, tiebreak: 'tied', decided: true }),
        ]}
      />
    )
    expect(screen.getByRole('heading', { name: 'B' })).toBeInTheDocument()
    expect(screen.getByText('Retenu par le host, à égalité parfaite avec A.')).toBeInTheDocument()
  })

  it('should render nothing without results', () => {
    const { container } = render(<ResultsList participantCount={0} results={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
