import { describe, expect, it } from 'vitest'

import {
  RECENT_WINNER_WINDOW_DAYS,
  lastWinLabel,
  recentWinLabel,
  recentWinnerCount,
  recentWinnerDates,
  withoutRecentWinners,
} from './recent-winners'

const SAKURA = '11111111-1111-4111-8111-111111111111'
const TRATTORIA = '22222222-2222-4222-8222-222222222222'

describe('recentWinnerDates', () => {
  it('should index the last win by restaurant', () => {
    const dates = recentWinnerDates([
      { restaurant_id: SAKURA, last_won_at: '2026-09-12T11:30:00Z' },
      { restaurant_id: TRATTORIA, last_won_at: '2026-09-05T11:30:00Z' },
    ])

    expect(dates[SAKURA]).toBe('2026-09-12T11:30:00Z')
    expect(recentWinnerCount(dates)).toBe(2)
  })

  it('should know nothing from an empty answer', () => {
    const dates = recentWinnerDates([])
    expect(recentWinnerCount(dates)).toBe(0)
    expect(dates[SAKURA]).toBeUndefined()
  })
})

describe('recentWinLabel', () => {
  const now = new Date('2026-09-18T12:00:00Z')

  it('should count the days since the win', () => {
    expect(recentWinLabel('2026-09-12T12:00:00Z', now)).toBe('Gagnant il y a 6 jours')
  })

  it('should say yesterday rather than a count of one', () => {
    expect(recentWinLabel('2026-09-17T12:00:00Z', now)).toBe('Gagnant hier')
  })
})

describe('lastWinLabel', () => {
  it('should name the day of the last win', () => {
    // Midi : la date est la même dans tous les fuseaux qui nous concernent.
    expect(lastWinLabel('2026-08-28T12:00:00Z')).toBe('Déjà gagnant le 28 août')
  })
})

describe('withoutRecentWinners', () => {
  const dates = recentWinnerDates([{ restaurant_id: SAKURA, last_won_at: '2026-09-12T11:30:00Z' }])

  it('should drop the recent winners and keep the order', () => {
    expect(withoutRecentWinners([TRATTORIA, SAKURA], dates)).toEqual([TRATTORIA])
  })

  it('should keep everything when nothing has won lately', () => {
    expect(withoutRecentWinners([SAKURA, TRATTORIA], recentWinnerDates([]))).toEqual([
      SAKURA,
      TRATTORIA,
    ])
  })
})

describe('RECENT_WINNER_WINDOW_DAYS', () => {
  it('should mirror recent_winners_window() in the database', () => {
    expect(RECENT_WINNER_WINDOW_DAYS).toBe(30)
  })
})
