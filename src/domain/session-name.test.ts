import { describe, expect, it } from 'vitest'

import { mealAt } from './session-name'

describe('mealAt', () => {
  it('should call it lunch until 3 pm, dinner afterwards', () => {
    expect(mealAt(new Date(2026, 8, 29, 12, 0))).toBe('lunch')
    expect(mealAt(new Date(2026, 8, 29, 14, 59))).toBe('lunch')
    expect(mealAt(new Date(2026, 8, 29, 15, 0))).toBe('dinner')
    expect(mealAt(new Date(2026, 8, 29, 20, 0))).toBe('dinner')
  })

  it('should read the hour in the given time zone', () => {
    // 13 h 30 UTC, c'est 15 h 30 à Paris en été : déjà le dîner.
    const instant = new Date('2026-09-29T13:30:00Z')
    expect(mealAt(instant, 'UTC')).toBe('lunch')
    expect(mealAt(instant, 'Europe/Paris')).toBe('dinner')
  })
})
