// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  INSTALL_DISMISSED_KEY,
  markSessionCompleted,
  resetInstallOfferCache,
} from '@/lib/pwa/install-offer'
import { INSTALL_PROMPT_CHANGE } from '@/lib/pwa/install-prompt'

import { InstallBanner } from './install-banner'

import type { BeforeInstallPromptEvent } from '@/lib/pwa/install-prompt'

const captureEvent = vi.fn()

vi.mock('@/lib/analytics/client', () => ({
  isAnalyticsConfigured: () => false,
  captureEvent: (...args: unknown[]) => captureEvent(...args),
}))

function fakePrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent
  const prompt = vi.fn(async () => undefined)
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  })
  return { event, prompt }
}

/** Ce que fait le script d'amorçage quand le navigateur émet l'invitation. */
function browserOffersInstall(event: BeforeInstallPromptEvent) {
  act(() => {
    window.__omkInstallPrompt = event
    window.dispatchEvent(new Event(INSTALL_PROMPT_CHANGE))
  })
}

describe('InstallBanner', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetInstallOfferCache()
    window.__omkInstallPrompt = null
    captureEvent.mockClear()
    window.matchMedia = vi.fn(() => ({ matches: false }) as unknown as MediaQueryList)
  })

  afterEach(() => {
    window.__omkInstallPrompt = null
  })

  it('should not show before a first successful session', () => {
    render(<InstallBanner />)
    browserOffersInstall(fakePrompt().event)

    expect(screen.queryByRole('button', { name: 'Installer' })).not.toBeInTheDocument()
  })

  it('should not show without a browser prompt, even after a session', () => {
    markSessionCompleted()
    render(<InstallBanner />)

    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('should open the browser prompt and count the answer', async () => {
    const user = userEvent.setup()
    markSessionCompleted()
    const { event, prompt } = fakePrompt('accepted')
    render(<InstallBanner />)
    browserOffersInstall(event)

    expect(
      screen.getByRole('region', { name: 'Garder onmangekoi sous la main' })
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Installer' }))

    expect(prompt).toHaveBeenCalledTimes(1)
    expect(captureEvent).toHaveBeenCalledWith('pwa_install_prompted', { outcome: 'accepted' })
    // Une invitation ne sert qu'une fois : la bannière disparaît.
    expect(screen.queryByRole('button', { name: 'Installer' })).not.toBeInTheDocument()
  })

  it('should remember « Plus tard » and step aside', async () => {
    const user = userEvent.setup()
    markSessionCompleted()
    render(<InstallBanner />)
    browserOffersInstall(fakePrompt().event)

    await user.click(screen.getByRole('button', { name: 'Plus tard' }))

    expect(window.localStorage.getItem(INSTALL_DISMISSED_KEY)).not.toBeNull()
    expect(captureEvent).toHaveBeenCalledWith('pwa_install_prompted', { outcome: 'later' })
    expect(screen.queryByRole('button', { name: 'Installer' })).not.toBeInTheDocument()
  })

  it('should stay hidden once the app runs installed', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }) as unknown as MediaQueryList)
    markSessionCompleted()
    render(<InstallBanner />)
    browserOffersInstall(fakePrompt().event)

    expect(screen.queryByRole('button', { name: 'Installer' })).not.toBeInTheDocument()
  })
})
