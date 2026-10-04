// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { SuggestionNotice } from './suggestion-notice'

import type { SuggestionSummary } from '@/domain/suggestions'

function renderNotice(summary: SuggestionSummary, locale: 'fr' | 'en' = 'fr') {
  renderWithIntl(<SuggestionNotice summary={summary} onReset={vi.fn()} />, { locale })
}

describe('SuggestionNotice', () => {
  it('should say what was excluded and where the fresh one comes from', () => {
    renderNotice({ recent: 2, winners: 3, days: 30, fresh: 'catalog' })
    expect(
      screen.getByText(
        'Vus récemment, sans les 3 gagnants des 30 derniers jours — plus un jamais proposé, le dernier arrivé au carnet. Tout reste modifiable.'
      )
    ).toBeInTheDocument()
  })

  it('should speak in the singular for a single winner and a single restaurant', () => {
    renderNotice({ recent: 1, winners: 1, days: 30, fresh: 'mine' })
    expect(
      screen.getByText(
        'Vu récemment, sans le gagnant des 30 derniers jours — plus un jamais proposé, le dernier que tu as ajouté. Tout reste modifiable.'
      )
    ).toBeInTheDocument()
  })

  it('should not mention winners when none were excluded', () => {
    renderNotice({ recent: 2, winners: 0, days: 30, fresh: 'none' })
    expect(screen.getByText('Vus récemment. Tout reste modifiable.')).toBeInTheDocument()
  })

  it('should say the same thing in English', () => {
    renderNotice({ recent: 2, winners: 3, days: 30, fresh: 'catalog' }, 'en')
    expect(
      screen.getByText(
        'Restaurants seen recently, minus the 3 winners from the last 30 days — plus one never suggested before, the latest addition to the database. You can change all of it.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start from scratch' })).toBeInTheDocument()
  })
})
