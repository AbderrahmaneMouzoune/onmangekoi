// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DISMISS_COOLDOWN_DAYS,
  INSTALL_DISMISSED_KEY,
  SESSION_COMPLETED_KEY,
  dismissInstallOffer,
  getInstallOffer,
  markSessionCompleted,
  parseDismissedAt,
  readInstallOfferFrom,
  resetInstallOfferCache,
  shouldOfferInstall,
  subscribeInstallOffer,
} from './install-offer'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 8, 29, 12)

const completed = { sessionCompleted: true, dismissedAt: null }

describe('shouldOfferInstall', () => {
  it('should offer once a session went through and the browser can install', () => {
    expect(
      shouldOfferInstall({ state: completed, canPrompt: true, standalone: false, now: NOW })
    ).toBe(true)
  })

  it('should wait for a first successful session', () => {
    expect(
      shouldOfferInstall({
        state: { sessionCompleted: false, dismissedAt: null },
        canPrompt: true,
        standalone: false,
        now: NOW,
      })
    ).toBe(false)
  })

  it('should stay silent without a browser prompt or once installed', () => {
    expect(
      shouldOfferInstall({ state: completed, canPrompt: false, standalone: false, now: NOW })
    ).toBe(false)
    expect(
      shouldOfferInstall({ state: completed, canPrompt: true, standalone: true, now: NOW })
    ).toBe(false)
  })

  it('should keep quiet after « Plus tard », then ask again after the cooldown', () => {
    const state = (daysAgo: number) => ({
      sessionCompleted: true,
      dismissedAt: NOW - daysAgo * DAY,
    })
    const offer = (daysAgo: number) =>
      shouldOfferInstall({ state: state(daysAgo), canPrompt: true, standalone: false, now: NOW })

    expect(offer(1)).toBe(false)
    expect(offer(DISMISS_COOLDOWN_DAYS - 1)).toBe(false)
    expect(offer(DISMISS_COOLDOWN_DAYS)).toBe(true)
  })
})

describe('parseDismissedAt', () => {
  it('should only accept a positive timestamp', () => {
    expect(parseDismissedAt(String(NOW))).toBe(NOW)
    expect(parseDismissedAt(null)).toBeNull()
    expect(parseDismissedAt('hier')).toBeNull()
    expect(parseDismissedAt('-5')).toBeNull()
  })
})

describe('install offer storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetInstallOfferCache()
  })

  it('should know nothing on a first visit', () => {
    expect(getInstallOffer()).toEqual({ sessionCompleted: false, dismissedAt: null })
  })

  it('should remember a completed session and notify subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeInstallOffer(listener)

    markSessionCompleted()

    expect(window.localStorage.getItem(SESSION_COMPLETED_KEY)).toBe('1')
    expect(getInstallOffer().sessionCompleted).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)

    markSessionCompleted()
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('should remember when the offer was put off', () => {
    dismissInstallOffer(NOW)

    expect(window.localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe(String(NOW))
    expect(getInstallOffer().dismissedAt).toBe(NOW)
  })

  it('should survive a storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError')
      },
    } as unknown as Storage
    expect(readInstallOfferFrom(broken)).toEqual({ sessionCompleted: false, dismissedAt: null })
    expect(readInstallOfferFrom(null)).toEqual({ sessionCompleted: false, dismissedAt: null })
  })
})
