// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SessionHistoryList } from './session-history-list'

import type { SessionHistoryEntry } from '@/data-access/models'

function entry(overrides: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry {
  return {
    id: crypto.randomUUID(),
    name: 'Midi de mardi',
    invite_code: '7K3M9P',
    status: 'closed',
    created_at: new Date().toISOString(),
    closed_at: new Date().toISOString(),
    is_host: false,
    participant_count: 3,
    restaurant_count: 5,
    winner_name: 'Maison Pho',
    winner_score: 4,
    ...overrides,
  }
}

describe('SessionHistoryList', () => {
  it('should open a closed session on its results, winner in plain sight', () => {
    render(<SessionHistoryList entries={[entry()]} />)

    expect(screen.getByRole('link', { name: /Midi de mardi/ })).toHaveAttribute(
      'href',
      '/sessions/7K3M9P/results'
    )
    expect(screen.getByText('Maison Pho')).toBeInTheDocument()
    expect(screen.getByText('+4')).toBeInTheDocument()
    expect(screen.getByText('Terminée')).toBeInTheDocument()
  })

  it('should send a live session back to its room, with no winner yet', () => {
    render(
      <SessionHistoryList
        entries={[
          entry({
            name: 'Vote en cours',
            status: 'voting',
            closed_at: null,
            winner_name: null,
            winner_score: null,
          }),
        ]}
      />
    )

    expect(screen.getByRole('link', { name: /Vote en cours/ })).toHaveAttribute(
      'href',
      '/sessions/7K3M9P'
    )
    expect(screen.getByText('Vote en cours', { selector: 'span.truncate' })).toBeInTheDocument()
  })

  it('should tell apart the sessions I organized', () => {
    render(
      <SessionHistoryList
        entries={[entry({ is_host: true }), entry({ name: 'Chez les autres', is_host: false })]}
      />
    )

    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByText(/organisée par toi/)).toBeInTheDocument()
  })
})
