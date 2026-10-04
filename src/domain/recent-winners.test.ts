import { describe, expect, it } from 'vitest'

import {
  RECENT_WINNER_WINDOW_DAYS,
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
