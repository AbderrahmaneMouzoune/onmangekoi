// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionCountdown } from './session-countdown'

import type { Session } from '@/data-access/models'

const extendSessionAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/sessions', () => ({ extendSessionAction }))

// Mardi 7 septembre 2026, 11:50 — l'échéance est à 12:00.
const NOW = new Date('2026-09-07T11:50:00.000Z')
const CLOSES_AT = '2026-09-07T12:00:00.000Z'

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    name: 'Lunch du vendredi',
    host_id: 'host',
    invite_code: '7K3M9P',
    invite_token: 'a'.repeat(32),
    status: 'voting',
    closes_at: CLOSES_AT,
    closed_at: null,
    created_at: NOW.toISOString(),
    launched_at: NOW.toISOString(),
    parent_session_id: null,
    tiebreak_method: null,
    tiebreak_winner_id: null,
    ...overrides,
  }
}

/**
 * Place l'horloge à `iso` et laisse passer le tic d'une seconde : avancer les
 * minuteurs avance aussi l'horloge feinte, d'où la seconde retranchée.
 */
function clockTo(iso: string) {
  act(() => {
    vi.setSystemTime(new Date(iso).getTime() - 1000)
    vi.advanceTimersByTime(1000)
  })
}

function renderCountdown(props: Partial<Parameters<typeof SessionCountdown>[0]> = {}) {
  const onExpired = vi.fn()
  const onExtended = vi.fn()
  render(
    <SessionCountdown
      session={session()}
      isHost={false}
      onExtended={onExtended}
      onExpired={onExpired}
      {...props}
    />
  )
  return { onExpired, onExtended }
}

describe('SessionCountdown', () => {
  beforeEach(() => {
    extendSessionAction.mockReset()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should show the time left before the automatic close', () => {
    renderCountdown()
    expect(screen.getByRole('timer')).toHaveTextContent('10:00')
    expect(screen.getByText(/clôture automatique/i)).toBeInTheDocument()
  })

  it('should render nothing for a session without a deadline', () => {
    const { container } = render(
      <SessionCountdown
        session={session({ closes_at: null })}
        isHost
        onExtended={vi.fn()}
        onExpired={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('should announce the launch deadline while the room is still waiting', () => {
    renderCountdown({ session: session({ status: 'waiting', launched_at: null }) })
    expect(screen.getByText(/vote à lancer avant/i)).toBeInTheDocument()
  })

  it('should recompute from the clock rather than counting down on its own', () => {
    renderCountdown()
    // Un onglet en arrière-plan : le minuteur ne tourne pas, l'horloge si.
    clockTo('2026-09-07T11:55:30.000Z')
    expect(screen.getByRole('timer')).toHaveTextContent('04:30')
  })

  it('should tell the room once the deadline is reached and ask for a resync', () => {
    const { onExpired } = renderCountdown()
    clockTo('2026-09-07T12:00:01.000Z')
    expect(screen.getByRole('timer')).toHaveTextContent(/clôture/i)
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it('should let the host buy five more minutes', async () => {
    const extended = session({ closes_at: '2026-09-07T12:05:00.000Z' })
    extendSessionAction.mockResolvedValue({ ok: true, data: extended })

    const { onExtended } = renderCountdown({ isHost: true })
    await userEvent.click(screen.getByRole('button', { name: /\+5 min/i }))

    expect(extendSessionAction).toHaveBeenCalledWith(session().id)
    expect(onExtended).toHaveBeenCalledWith(extended)
  })

  it('should not offer the extension to a participant', () => {
    renderCountdown()
    expect(screen.queryByRole('button', { name: /\+5 min/i })).not.toBeInTheDocument()
  })

  it('should show why the extension failed', async () => {
    extendSessionAction.mockResolvedValue({ ok: false, error: 'Seul le host peut faire ça.' })
    renderCountdown({ isHost: true })
    await userEvent.click(screen.getByRole('button', { name: /\+5 min/i }))
    expect(await screen.findByText('Seul le host peut faire ça.')).toBeInTheDocument()
  })
})
