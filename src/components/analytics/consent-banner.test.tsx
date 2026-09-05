// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CONSENT_STORAGE_KEY, resetConsentCache } from '@/lib/analytics/consent'

import { ConsentBanner } from './consent-banner'

const isAnalyticsConfigured = vi.fn(() => true)

vi.mock('@/lib/analytics/client', () => ({
  isAnalyticsConfigured: () => isAnalyticsConfigured(),
}))

describe('ConsentBanner', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetConsentCache()
    isAnalyticsConfigured.mockReturnValue(true)
  })

  it('should offer refusing as plainly as accepting', () => {
    render(<ConsentBanner />)

    expect(screen.getByRole('button', { name: 'Refuser' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Accepter' })).toBeVisible()
  })

  it('should store the refusal and disappear', async () => {
    const user = userEvent.setup()
    render(<ConsentBanner />)

    await user.click(screen.getByRole('button', { name: 'Refuser' }))

    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('denied')
    expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument()
  })

  it('should store the consent and disappear', async () => {
    const user = userEvent.setup()
    render(<ConsentBanner />)

    await user.click(screen.getByRole('button', { name: 'Accepter' }))

    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('granted')
    expect(screen.queryByRole('button', { name: 'Accepter' })).not.toBeInTheDocument()
  })

  it('should not ask again once the choice is made', () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, 'denied')
    render(<ConsentBanner />)

    expect(screen.queryByRole('button', { name: 'Accepter' })).not.toBeInTheDocument()
  })

  it('should stay hidden when no PostHog key is configured', () => {
    isAnalyticsConfigured.mockReturnValue(false)
    render(<ConsentBanner />)

    expect(screen.queryByRole('button', { name: 'Accepter' })).not.toBeInTheDocument()
  })
})
