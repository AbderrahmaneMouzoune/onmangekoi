import { describe, expect, it } from 'vitest'

import { isOpenNow, parseOpeningHours } from './opening-hours'

/** Lundi 2026-09-07, heure locale. */
function monday(hours: number, minutes = 0): Date {
  return new Date(2026, 8, 7, hours, minutes)
}

describe('parseOpeningHours', () => {
  it('should read a well-formed payload', () => {
    expect(
      parseOpeningHours({
        timezone: 'Europe/Paris',
        periods: [{ day: 1, open: '11:30', close: '14:30' }],
      })
    ).toEqual({
      timezone: 'Europe/Paris',
      periods: [{ day: 1, open: '11:30', close: '14:30' }],
    })
  })

  it('should reject malformed or empty payloads', () => {
    expect(parseOpeningHours(null)).toBeNull()
    expect(parseOpeningHours({ periods: [] })).toBeNull()
    expect(parseOpeningHours({ periods: [{ day: 7, open: '11:30', close: '14:30' }] })).toBeNull()
    expect(parseOpeningHours({ periods: [{ day: 1, open: '25:00', close: '14:30' }] })).toBeNull()
    expect(parseOpeningHours({ periods: [{ day: 1, open: '11:30' }] })).toBeNull()
    expect(parseOpeningHours('lundi au vendredi')).toBeNull()
  })
})

describe('isOpenNow', () => {
  const lunch = parseOpeningHours({ periods: [{ day: 1, open: '11:30', close: '14:30' }] })

  it('should not answer without usable hours', () => {
    expect(isOpenNow(null)).toBeNull()
  })

  it('should open inside the period and close outside', () => {
    expect(isOpenNow(lunch, monday(12, 30))).toBe(true)
    expect(isOpenNow(lunch, monday(11, 30))).toBe(true)
    expect(isOpenNow(lunch, monday(11, 29))).toBe(false)
    expect(isOpenNow(lunch, monday(14, 30))).toBe(false)
  })

  it('should stay closed on another day', () => {
    // Mardi, même heure
    expect(isOpenNow(lunch, new Date(2026, 8, 8, 12, 30))).toBe(false)
  })

  it('should handle a period running past midnight', () => {
    const night = parseOpeningHours({ periods: [{ day: 1, open: '19:00', close: '02:00' }] })
    expect(isOpenNow(night, monday(23, 0))).toBe(true)
    // Mardi 01:00 : toujours dans la période ouverte lundi soir
    expect(isOpenNow(night, new Date(2026, 8, 8, 1, 0))).toBe(true)
    expect(isOpenNow(night, new Date(2026, 8, 8, 3, 0))).toBe(false)
  })

  it('should wrap a saturday night period over into sunday', () => {
    const night = parseOpeningHours({ periods: [{ day: 6, open: '22:00', close: '02:00' }] })
    // Dimanche 2026-09-06 à 01:00
    expect(isOpenNow(night, new Date(2026, 8, 6, 1, 0))).toBe(true)
    expect(isOpenNow(night, new Date(2026, 8, 6, 3, 0))).toBe(false)
  })

  it('should accept 24:00 as closing at midnight', () => {
    const late = parseOpeningHours({ periods: [{ day: 1, open: '19:00', close: '24:00' }] })
    expect(isOpenNow(late, monday(23, 59))).toBe(true)
    expect(isOpenNow(late, new Date(2026, 8, 8, 0, 1))).toBe(false)
  })

  it('should reason in the restaurant timezone when it is given', () => {
    const tokyo = parseOpeningHours({
      timezone: 'Asia/Tokyo',
      periods: [{ day: 1, open: '11:30', close: '14:30' }],
    })
    // 03:00 UTC = lundi 12:00 à Tokyo (UTC+9) ; 06:00 UTC = lundi 15:00
    expect(isOpenNow(tokyo, new Date('2026-09-07T03:00:00Z'))).toBe(true)
    expect(isOpenNow(tokyo, new Date('2026-09-07T06:00:00Z'))).toBe(false)
  })

  it('should fall back to the visitor time on an unknown timezone', () => {
    const broken = parseOpeningHours({
      timezone: 'Mars/Olympus',
      periods: [{ day: 1, open: '11:30', close: '14:30' }],
    })
    expect(isOpenNow(broken, monday(12, 30))).toBe(true)
  })
})
