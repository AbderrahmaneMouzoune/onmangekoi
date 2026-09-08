import { describe, expect, it } from 'vitest'

import {
  closeAttribution,
  formatCountdown,
  formatDeadlineTime,
  nextOccurrence,
  remainingMs,
  resolveClosesAt,
} from './session-deadline'

const NOW = new Date('2026-09-07T10:00:00.000Z')

describe('resolveClosesAt', () => {
  it('should turn a duration into an instant on the given clock', () => {
    expect(resolveClosesAt({ closesInMinutes: 10 }, NOW)).toBe('2026-09-07T10:10:00.000Z')
  })

  it('should keep an absolute instant as it is', () => {
    expect(resolveClosesAt({ closesAt: '2026-09-07T12:00:00.000Z' }, NOW)).toBe(
      '2026-09-07T12:00:00.000Z'
    )
  })

  it('should mean « no deadline » when nothing is chosen', () => {
    expect(resolveClosesAt({}, NOW)).toBeNull()
    expect(resolveClosesAt({ closesInMinutes: null, closesAt: null }, NOW)).toBeNull()
  })
})

describe('nextOccurrence', () => {
  it('should target today when the time is still ahead', () => {
    const now = new Date(2026, 8, 7, 11, 30)
    expect(nextOccurrence('12:00', now)).toEqual(new Date(2026, 8, 7, 12, 0, 0, 0))
  })

  it('should roll over to tomorrow when the time has passed', () => {
    const now = new Date(2026, 8, 7, 23, 59)
    expect(nextOccurrence('01:00', now)).toEqual(new Date(2026, 8, 8, 1, 0, 0, 0))
  })

  it('should reject an unreadable time', () => {
    expect(nextOccurrence('', NOW)).toBeNull()
    expect(nextOccurrence('25:00', NOW)).toBeNull()
  })
})

describe('remainingMs', () => {
  it('should count what is left', () => {
    expect(remainingMs('2026-09-07T10:05:00.000Z', NOW)).toBe(5 * 60_000)
  })

  it('should never go negative', () => {
    expect(remainingMs('2026-09-07T09:00:00.000Z', NOW)).toBe(0)
  })

  it('should treat an unreadable date as expired', () => {
    expect(remainingMs('pas une date', NOW)).toBe(0)
  })
})

describe('formatCountdown', () => {
  it('should read like a stopwatch under an hour', () => {
    expect(formatCountdown(9 * 60_000 + 58_000)).toBe('09:58')
    expect(formatCountdown(0)).toBe('00:00')
  })

  it('should drop the seconds beyond an hour', () => {
    expect(formatCountdown(65 * 60_000)).toBe('1 h 05')
  })

  it('should round up the running second', () => {
    expect(formatCountdown(1_500)).toBe('00:02')
  })
})

describe('formatDeadlineTime', () => {
  it('should show the closing hour', () => {
    expect(formatDeadlineTime('2026-09-07T10:05:00.000Z')).toMatch(/\d{2}[:h]\d{2}/)
  })
})

describe('closeAttribution', () => {
  it('should credit the completed vote first', () => {
    expect(
      closeAttribution({
        everyoneFinished: true,
        closesAt: '2026-09-07T10:00:00.000Z',
        closedAt: '2026-09-07T10:00:30.000Z',
      })
    ).toBe('auto')
  })

  it('should credit the deadline when it had been reached', () => {
    expect(
      closeAttribution({
        everyoneFinished: false,
        closesAt: '2026-09-07T10:00:00.000Z',
        closedAt: '2026-09-07T10:00:30.000Z',
      })
    ).toBe('deadline')
  })

  it('should credit the host who closed early', () => {
    expect(
      closeAttribution({
        everyoneFinished: false,
        closesAt: '2026-09-07T12:00:00.000Z',
        closedAt: '2026-09-07T10:00:00.000Z',
      })
    ).toBe('host')
  })

  it('should credit the host when there is no deadline at all', () => {
    expect(
      closeAttribution({
        everyoneFinished: false,
        closesAt: null,
        closedAt: '2026-09-07T10:00:00.000Z',
      })
    ).toBe('host')
  })
})
