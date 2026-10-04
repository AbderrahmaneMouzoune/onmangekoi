// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { DecisionPanel } from './decision-panel'

const confirmDecisionAction = vi.hoisted(() => vi.fn())
const captureEvent = vi.hoisted(() => vi.fn())
const refresh = vi.hoisted(() => vi.fn())

vi.mock('@/actions/sessions', () => ({ confirmDecisionAction }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/lib/analytics/client', () => ({ captureEvent }))

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const PHO = '22222222-2222-4222-8222-222222222222'
const MARCEL = '33333333-3333-4333-8333-333333333333'

const CANDIDATES = [
  { restaurantId: PHO, name: 'Maison Pho', rank: 1 },
  { restaurantId: MARCEL, name: 'Chez Marcel', rank: 2 },
]

function renderPanel(props: Partial<React.ComponentProps<typeof DecisionPanel>> = {}) {
  return renderWithIntl(
    <DecisionPanel sessionId={SESSION_ID} candidates={CANDIDATES} decidedId={null} {...props} />
  )
}

describe('DecisionPanel', () => {
  beforeEach(() => {
    confirmDecisionAction.mockReset()
    captureEvent.mockReset()
    refresh.mockReset()
  })

  it('should offer the vote winner by default', async () => {
    confirmDecisionAction.mockResolvedValue({ ok: true, data: {} })
    renderPanel()
    expect(screen.getByRole('heading', { name: 'On y va ?' })).toBeInTheDocument()
    expect(screen.getByText(/On mange chez Maison Pho/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'On y va' }))

    expect(confirmDecisionAction).toHaveBeenCalledWith(SESSION_ID, PHO)
    expect(captureEvent).toHaveBeenCalledWith('decision_confirmed', {
      session_id: SESSION_ID,
      rank: 1,
      follows_vote: true,
      is_change: false,
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('should let the host pick another restaurant of the session', async () => {
    confirmDecisionAction.mockResolvedValue({ ok: true, data: {} })
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: /choisir un autre resto/i }))
    expect(screen.getByRole('group', { name: 'Où va le groupe ?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Chez Marcel/ }))
    await userEvent.click(screen.getByRole('button', { name: 'On y va' }))

    expect(confirmDecisionAction).toHaveBeenCalledWith(SESSION_ID, MARCEL)
    expect(captureEvent).toHaveBeenCalledWith(
      'decision_confirmed',
      expect.objectContaining({ rank: 2, follows_vote: false })
    )
  })

  it('should let the host change their mind once decided', async () => {
    confirmDecisionAction.mockResolvedValue({ ok: true, data: {} })
    renderPanel({ decidedId: MARCEL })
    expect(screen.getByRole('heading', { name: 'C’est décidé' })).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /changer d’avis/i }))
    expect(screen.getByRole('radio', { name: /Chez Marcel/ })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: /Maison Pho/ }))
    await userEvent.click(screen.getByRole('button', { name: /confirmer ce choix/i }))

    expect(confirmDecisionAction).toHaveBeenCalledWith(SESSION_ID, PHO)
    expect(captureEvent).toHaveBeenCalledWith(
      'decision_confirmed',
      expect.objectContaining({ is_change: true })
    )
  })

  it('should show what the database refused', async () => {
    confirmDecisionAction.mockResolvedValue({
      ok: false,
      error: 'Ce restaurant ne fait pas partie de la session.',
    })
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'On y va' }))
    expect(
      await screen.findByText('Ce restaurant ne fait pas partie de la session.')
    ).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it('should not offer alternatives when the session had a single restaurant', () => {
    renderPanel({ candidates: CANDIDATES.slice(0, 1) })
    expect(
      screen.queryByRole('button', { name: /choisir un autre resto/i })
    ).not.toBeInTheDocument()
  })
})
