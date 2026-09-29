// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { DuoPanel } from './duo-panel'
import { FinishedPanel } from './finished-panel'

import type { ParticipantWithProfile, Session } from '@/data-access/models'
import type { SessionRules } from '@/domain/session-rules'

// Les Server Actions ne s'exécutent pas dans jsdom : seul leur appel compte ici.
vi.mock('@/actions/sessions', () => ({ closeSessionAction: vi.fn() }))
vi.mock('@/actions/push', () => ({ subscribePushAction: vi.fn(), unsubscribePushAction: vi.fn() }))

const HOST_ID = '11111111-1111-4111-8111-111111111111'
const PARTNER_ID = '22222222-2222-4222-8222-222222222222'
const INVITE_URL = 'https://onmangekoi.test/join/ABC123'

const DUO_RULES: SessionRules = { superlikes: 1, vetos: 1, close_at_ratio: 1, duo: true }

const session: Session = {
  closed_at: null,
  closes_at: null,
  created_at: '2026-09-29T08:00:00Z',
  host_id: HOST_ID,
  id: '33333333-3333-4333-8333-333333333333',
  invite_code: 'ABC123',
  invite_token: 'f'.repeat(32),
  launched_at: '2026-09-29T08:00:00Z',
  name: 'À deux · déj du mardi',
  parent_session_id: null,
  results_code: 'H4V2Q8ZX0M',
  results_public: false,
  rules: DUO_RULES,
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
    profiles: { id: profileId, pseudo: profileId === HOST_ID ? 'Moi' : 'Camille' },
  }
}

function renderPanel(participants: ParticipantWithProfile[]) {
  return renderWithIntl(
    <DuoPanel
      sessionId={session.id}
      sessionName={session.name}
      participants={participants}
      meId={HOST_ID}
      inviteUrl={INVITE_URL}
    />
  )
}

describe('DuoPanel', () => {
  it('should put the link first while the other has not opened it — no code to dictate', () => {
    renderPanel([participant(HOST_ID)])
    expect(screen.getByRole('heading', { name: 'Envoie ce lien' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copier le lien' })).toBeInTheDocument()
    expect(screen.queryByText('ABC123')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copier le code' })).toBeNull()
  })

  it('should shrink to a reminder of the rule once both are in', () => {
    renderPanel([participant(HOST_ID), participant(PARTNER_ID)])
    expect(screen.queryByRole('heading', { name: 'Envoie ce lien' })).toBeNull()
    expect(screen.getByText('Camille')).toBeInTheDocument()
    expect(screen.getByText(/premier « ça me va » commun/)).toBeInTheDocument()
  })
})

describe('FinishedPanel in a duo', () => {
  function renderFinished(participants: ParticipantWithProfile[]) {
    return renderWithIntl(
      <FinishedPanel
        session={session}
        participants={participants}
        meId={HOST_ID}
        isHost
        connection="live"
        meFinished
      />
    )
  }

  it('should wait for the other, not announce a ranking, when alone with a finished deck', () => {
    renderFinished([participant(HOST_ID, true)])
    expect(screen.getByText(/pas encore ouvert le lien/)).toBeInTheDocument()
    expect(screen.queryByText(/Tout le monde a terminé/)).toBeNull()
    // Deux places comptent, même quand la seconde est vide.
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('should keep the agreement possible while the other is still swiping', () => {
    renderFinished([participant(HOST_ID, true), participant(PARTNER_ID)])
    expect(screen.getByText(/Si Camille dit « ça me va »/)).toBeInTheDocument()
    expect(screen.getByText(/au premier accord, ou quand vous aurez fini/)).toBeInTheDocument()
  })
})
