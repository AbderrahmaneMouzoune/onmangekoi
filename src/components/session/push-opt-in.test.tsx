// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PushOptIn } from './push-opt-in'

const mocks = vi.hoisted(() => ({
  env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BPublicKey' as string | undefined },
  pushPermission: vi.fn(),
  currentPushSubscription: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
  isAppleMobile: vi.fn(),
  subscribePushAction: vi.fn(),
  unsubscribePushAction: vi.fn(),
  captureEvent: vi.fn(),
}))

vi.mock('@/env', () => ({ env: mocks.env }))
// Le service worker n'est voulu qu'en production : ici, on fait comme si.
vi.mock('@/lib/pwa/registration', () => ({ isServiceWorkerEnabled: () => true }))
vi.mock('@/lib/pwa/push-subscription', () => ({
  pushPermission: mocks.pushPermission,
  currentPushSubscription: mocks.currentPushSubscription,
  subscribeToPush: mocks.subscribeToPush,
  unsubscribeFromPush: mocks.unsubscribeFromPush,
  isAppleMobile: mocks.isAppleMobile,
}))
// Les Server Actions ne s'exécutent pas dans jsdom : seul leur appel compte ici.
vi.mock('@/actions/push', () => ({
  subscribePushAction: mocks.subscribePushAction,
  unsubscribePushAction: mocks.unsubscribePushAction,
}))
vi.mock('@/lib/analytics/client', () => ({ captureEvent: mocks.captureEvent }))

const SESSION_ID = '33333333-3333-4333-8333-333333333333'
const SUBSCRIPTION = {
  endpoint: 'https://push.example.test/abc',
  keys: { p256dh: 'BNcRdreALRFX', auth: 'tBHItJI5svbpez7KI4CCXg' },
}

describe('PushOptIn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BPublicKey'
    mocks.pushPermission.mockReturnValue('default')
    mocks.currentPushSubscription.mockResolvedValue(null)
    mocks.isAppleMobile.mockReturnValue(false)
    mocks.subscribePushAction.mockResolvedValue({ ok: true, data: undefined })
    mocks.unsubscribePushAction.mockResolvedValue({ ok: true, data: undefined })
  })

  it('should not ask for permission before the user clicks', async () => {
    render(<PushOptIn sessionId={SESSION_ID} context="launch" />)

    expect(
      await screen.findByRole('button', { name: 'Me prévenir au lancement' })
    ).toBeInTheDocument()
    expect(mocks.subscribeToPush).not.toHaveBeenCalled()
    expect(mocks.subscribePushAction).not.toHaveBeenCalled()
  })

  it('should subscribe this browser on click, then say so', async () => {
    mocks.subscribeToPush.mockResolvedValue({ status: 'subscribed', subscription: SUBSCRIPTION })
    render(<PushOptIn sessionId={SESSION_ID} context="results" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Me prévenir du résultat' }))

    expect(mocks.subscribeToPush).toHaveBeenCalledWith('BPublicKey')
    expect(mocks.subscribePushAction).toHaveBeenCalledWith(SUBSCRIPTION)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ce navigateur te préviendra dès que le classement tombe'
    )
    expect(mocks.captureEvent).toHaveBeenCalledWith('push_subscribed', {
      session_id: SESSION_ID,
      context: 'results',
    })
  })

  it('should keep the button when the permission box is closed without an answer', async () => {
    mocks.subscribeToPush.mockResolvedValue({ status: 'dismissed' })
    render(<PushOptIn sessionId={SESSION_ID} context="launch" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Me prévenir au lancement' }))

    expect(screen.getByRole('button', { name: 'Me prévenir au lancement' })).toBeEnabled()
    expect(mocks.subscribePushAction).not.toHaveBeenCalled()
  })

  it('should explain a refusal instead of asking again', async () => {
    mocks.subscribeToPush.mockResolvedValue({ status: 'denied' })
    render(<PushOptIn sessionId={SESSION_ID} context="launch" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Me prévenir au lancement' }))

    expect(await screen.findByText(/Les notifications sont bloquées/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('should show the blocked state straight away when permission was already refused', async () => {
    mocks.pushPermission.mockReturnValue('denied')
    render(<PushOptIn sessionId={SESSION_ID} context="launch" />)

    expect(await screen.findByText(/Les notifications sont bloquées/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('should re-sync an existing subscription, and let the user opt out', async () => {
    const existing = { toJSON: () => SUBSCRIPTION }
    mocks.pushPermission.mockReturnValue('granted')
    mocks.currentPushSubscription.mockResolvedValue(existing)
    mocks.unsubscribeFromPush.mockResolvedValue(SUBSCRIPTION.endpoint)
    render(<PushOptIn sessionId={SESSION_ID} context="launch" />)

    expect(await screen.findByRole('status')).toHaveTextContent('au lancement du vote')
    expect(mocks.subscribePushAction).toHaveBeenCalledWith(SUBSCRIPTION)

    await userEvent.click(screen.getByRole('button', { name: 'Ne plus me prévenir' }))

    expect(mocks.unsubscribePushAction).toHaveBeenCalledWith(SUBSCRIPTION.endpoint)
    expect(
      await screen.findByRole('button', { name: 'Me prévenir au lancement' })
    ).toBeInTheDocument()
  })

  it('should tell iPhone users to install the app first', async () => {
    mocks.pushPermission.mockReturnValue('unsupported')
    mocks.isAppleMobile.mockReturnValue(true)
    render(<PushOptIn sessionId={SESSION_ID} context="launch" />)

    expect(await screen.findByText(/ajoute onmangekoi à l’écran d’accueil/)).toBeInTheDocument()
  })

  it('should render nothing when push is not configured or not supported', async () => {
    mocks.pushPermission.mockReturnValue('unsupported')
    const { container, unmount } = render(<PushOptIn sessionId={SESSION_ID} context="launch" />)
    await vi.waitFor(() => expect(mocks.pushPermission).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    unmount()

    mocks.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = undefined
    mocks.pushPermission.mockClear()
    const second = render(<PushOptIn sessionId={SESSION_ID} context="launch" />)
    expect(second.container).toBeEmptyDOMElement()
    expect(mocks.pushPermission).not.toHaveBeenCalled()
  })
})
