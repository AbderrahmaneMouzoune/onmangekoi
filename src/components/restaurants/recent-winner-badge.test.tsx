// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { RecentWinnerBadge } from './recent-winner-badge'

describe('RecentWinnerBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-18T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should count the days since the win', () => {
    renderWithIntl(<RecentWinnerBadge wonAt="2026-09-12T12:00:00Z" excluded={false} />)
    expect(screen.getByText('Gagnant il y a 6 jours')).toBeInTheDocument()
  })

  it('should say yesterday rather than a count of one', () => {
    renderWithIntl(<RecentWinnerBadge wonAt="2026-09-17T12:00:00Z" excluded={false} />)
    expect(screen.getByText('Gagnant hier')).toBeInTheDocument()
  })

  it('should say what happens to the row once set aside', () => {
    renderWithIntl(<RecentWinnerBadge wonAt="2026-09-17T12:00:00Z" excluded />)
    expect(screen.getByText('Écarté')).toBeInTheDocument()
  })

  it('should speak English', () => {
    renderWithIntl(<RecentWinnerBadge wonAt="2026-09-12T12:00:00Z" excluded={false} />, {
      locale: 'en',
    })
    expect(screen.getByText('Won 6 days ago')).toBeInTheDocument()
  })
})
