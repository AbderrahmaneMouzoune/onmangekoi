// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { StatsPanel } from './account-stats'

import type { MyStats } from '@/data-access/models'

// Le panneau est pur ; seule sa variante serveur lit la base.
vi.mock('@/data-access/auth', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/data-access/stats', () => ({ getMyStats: vi.fn() }))
vi.mock('@/data-access/supabase/server', () => ({ createServerClient: vi.fn() }))

function stats(overrides: Partial<MyStats> = {}): MyStats {
  return {
    sessions_total: 4,
    sessions_hosted: 2,
    sessions_closed: 3,
    votes_total: 20,
    veto_votes: 1,
    fav_votes: 5,
    favorite_cuisine: 'Japonais',
    favorite_cuisine_votes: 6,
    top_restaurant_name: 'Maison Pho',
    top_restaurant_wins: 2,
    ...overrides,
  }
}

describe('StatsPanel', () => {
  it('should keep every definition-list group made of dt and dd only', () => {
    const { container } = renderWithIntl(<StatsPanel stats={stats()} />)

    expect(screen.getByText('2 organisées')).toBeInTheDocument()
    // axe (definition-list) : un groupe <div> d'un <dl> ne porte que des dt/dd.
    for (const group of container.querySelectorAll('dl > div')) {
      for (const child of group.children) {
        expect(['DT', 'DD']).toContain(child.tagName)
      }
    }
  })

  it('should invite to a first session when nothing is counted yet', () => {
    renderWithIntl(<StatsPanel stats={stats({ sessions_total: 0 })} />)

    expect(screen.getByText(/rien à compter pour l’instant/i)).toBeInTheDocument()
  })

  it('should agree every count with its number, in French as in English', () => {
    renderWithIntl(<StatsPanel stats={stats({ veto_votes: 0, top_restaurant_wins: 1 })} />)
    // Le français met zéro au singulier.
    expect(screen.getByText('0 veto')).toBeInTheDocument()
    expect(screen.getByText('1 victoire')).toBeInTheDocument()
  })

  it('should speak English on an English page, where zero takes the plural', () => {
    renderWithIntl(<StatsPanel stats={stats({ veto_votes: 0, top_restaurant_wins: 1 })} />, {
      locale: 'en',
    })
    expect(screen.getByRole('heading', { name: 'My stats' })).toBeInTheDocument()
    expect(screen.getByText('0 vetoes')).toBeInTheDocument()
    expect(screen.getByText('1 win')).toBeInTheDocument()
    expect(screen.getByText('6 positive votes')).toBeInTheDocument()
  })
})
