// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SESSION_RULES } from '@/domain/session-rules'
import { renderWithIntl } from '@/test/render'

import { RulesSummary } from './rules-summary'

function lines(name: string): string[] {
  return within(screen.getByRole('list', { name }))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '')
}

describe('RulesSummary', () => {
  it('should read the default rules as they have always worked', () => {
    renderWithIntl(<RulesSummary rules={DEFAULT_SESSION_RULES} />)
    expect(lines('Règles du vote')).toEqual([
      '1 coup de cœur',
      '1 veto',
      'Clôture quand tout le monde a voté',
    ])
  })

  it('should say a threshold and a disabled joker', () => {
    renderWithIntl(<RulesSummary rules={{ superlikes: 2, vetos: 0, close_at_ratio: 0.8 }} />)
    expect(lines('Règles du vote')).toEqual([
      '2 coups de cœur',
      'Aucun veto',
      expect.stringMatching(/^Clôture dès 80\s%\sdes votants$/),
    ])
  })

  it('should announce an open session first', () => {
    renderWithIntl(<RulesSummary rules={{ ...DEFAULT_SESSION_RULES, open: true }} />)
    expect(lines('Règles du vote')[0]).toBe('Session ouverte : chacun vote à son heure')
  })

  it('should speak English, percentages included', () => {
    renderWithIntl(<RulesSummary rules={{ superlikes: 2, vetos: 0, close_at_ratio: 0.8 }} />, {
      locale: 'en',
    })
    expect(lines('Voting rules')).toEqual([
      '2 favourites',
      'No vetoes',
      'Closes once 80% of voters are done',
    ])
  })
})
