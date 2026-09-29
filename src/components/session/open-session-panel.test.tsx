// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FinishedPanel } from './finished-panel'
import { OpenSessionPanel } from './open-session-panel'

import type { ParticipantWithProfile, Session } from '@/data-access/models'
import type { SessionRules } from '@/domain/session-rules'

// Les Server Actions ne s'exécutent pas dans jsdom : seul leur appel compte ici.
vi.mock('@/actions/sessions', () => ({ closeSessionAction: vi.fn() }))
vi.mock('@/actions/groups', () => ({ inviteGroupToSessionAction: vi.fn() }))
vi.mock('@/actions/push', () => ({ subscribePushAction: vi.fn(), unsubscribePushAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const HOST_ID = '11111111-1111-4111-8111-111111111111'
const GUEST_ID = '22222222-2222-4222-8222-222222222222'

const OPEN_RULES: SessionRules = { superlikes: 1, vetos: 1, close_at_ratio: 1, open: true }

const session: Session = {
  closed_at: null,
  closes_at: '2026-09-29T12:00:00Z',
  created_at: '2026-09-29T08:00:00Z',
  host_id: HOST_ID,
  id: '33333333-3333-4333-8333-333333333333',
  invite_code: 'ABC123',
  invite_token: 'f'.repeat(32),
  launched_at: '2026-09-29T08:00:00Z',
  name: 'Midi ouvert',
  parent_session_id: null,
  results_code: 'H4V2Q8ZX0M',
  results_public: false,
  rules: OPEN_RULES,
  status: 'voting',
  tiebreak_method: null,
  tiebreak_winner_id: null,
  decided_restaurant_id: null,
  decided_at: null,
}

function participant(profileId: string, finished = false): ParticipantWithProfile {
  return {
    has_finished_voting: finished,
    id: `p-${profileId}`,
    joined_at: '2026-09-29T08:00:00Z',
    profile_id: profileId,
    session_id: session.id,
    super_dislike_used: false,
    superlike_used: false,
    profiles: { id: profileId, pseudo: profileId === HOST_ID ? 'Hôte' : 'Invité' },
  }
}

function renderPanel(participants: ParticipantWithProfile[], isHost = true) {
  return render(
    <OpenSessionPanel
      session={session}
      rules={OPEN_RULES}
      participants={participants}
      isHost={isHost}
      inviteUrl="https://onmangekoi.test/join/ABC123"
      qrSvg={null}
      invitations={[]}
      groups={[]}
    />
  )
}

describe('OpenSessionPanel', () => {
  it('should announce the open mode in the rules', () => {
    renderPanel([participant(HOST_ID)])
    expect(screen.getByText('Session ouverte : chacun vote à son heure')).toBeInTheDocument()
    expect(screen.getByText('Clôture à l’échéance')).toBeInTheDocument()
  })

  it('should unfold the invitation for a host still alone: sharing comes first', () => {
    const { container } = renderPanel([participant(HOST_ID)])
    expect(container.querySelector('details')).toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'Copier le lien' })).toBeInTheDocument()
  })

  it('should stay folded once people are in, above the deck', () => {
    const { container } = renderPanel([participant(HOST_ID), participant(GUEST_ID)], false)
    expect(container.querySelector('details')).not.toHaveAttribute('open')
    expect(screen.getByText(/2 participants/)).toBeInTheDocument()
  })
})

describe('FinishedPanel in an open session', () => {
  it('should not wait for anyone: the deadline closes the vote', () => {
    render(
      <FinishedPanel
        session={session}
        participants={[participant(HOST_ID, true), participant(GUEST_ID)]}
        meId={HOST_ID}
        isHost
        connection="live"
        meFinished
      />
    )
    expect(screen.getByText(/La session reste ouverte jusqu’à l’échéance/)).toBeInTheDocument()
    expect(screen.queryByText(/On attend/)).toBeNull()
    expect(screen.getByText(/se clôture toute seule à l’échéance/)).toBeInTheDocument()
  })
})
