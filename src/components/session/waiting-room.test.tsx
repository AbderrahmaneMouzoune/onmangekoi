// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WaitingRoom } from './waiting-room'

import type { ParticipantWithProfile, Session } from '@/data-access/models'

// Les Server Actions ne s'exécutent pas dans jsdom : seul leur appel compte ici.
vi.mock('@/actions/sessions', () => ({
  deleteSessionAction: vi.fn(),
  launchSessionAction: vi.fn(),
  leaveSessionAction: vi.fn(),
}))

const HOST_ID = '11111111-1111-4111-8111-111111111111'
const GUEST_ID = '22222222-2222-4222-8222-222222222222'

const session: Session = {
  closed_at: null,
  created_at: '2026-09-07T12:00:00Z',
  host_id: HOST_ID,
  id: '33333333-3333-4333-8333-333333333333',
  invite_code: 'ABC123',
  invite_token: 'f'.repeat(32),
  launched_at: null,
  name: 'Lunch du vendredi',
  status: 'waiting',
}

function participant(profileId: string, pseudo: string): ParticipantWithProfile {
  return {
    has_finished_voting: false,
    id: `p-${profileId}`,
    joined_at: '2026-09-07T12:00:00Z',
    profile_id: profileId,
    session_id: session.id,
    super_dislike_used: false,
    superlike_used: false,
    profiles: { id: profileId, pseudo },
  }
}

function renderRoom({
  participants = [participant(HOST_ID, 'Alex'), participant(GUEST_ID, 'Sam')],
  restaurantCount = 2,
}: {
  participants?: ParticipantWithProfile[]
  restaurantCount?: number
} = {}) {
  return render(
    <WaitingRoom
      session={session}
      participants={participants}
      meId={HOST_ID}
      isHost
      inviteUrl="https://onmangekoi.test/j/ABC123"
      qrSvg={null}
      restaurantCount={restaurantCount}
      connection="live"
      onLaunched={vi.fn()}
    />
  )
}

const launchButton = () => screen.getByRole('button', { name: /lancer le vote/i })

describe('WaitingRoom', () => {
  it('should allow the launch when both minimums are met', () => {
    renderRoom()
    expect(launchButton()).toBeEnabled()
    expect(screen.getByText(/plus personne ne peut rejoindre/i)).toBeInTheDocument()
  })

  it('should block the launch with a single restaurant', () => {
    renderRoom({ restaurantCount: 1 })
    expect(launchButton()).toBeDisabled()
    expect(screen.getByText(/rien à départager/i)).toBeInTheDocument()
  })

  it('should block the launch while the host is alone', () => {
    renderRoom({ participants: [participant(HOST_ID, 'Alex')] })
    expect(launchButton()).toBeDisabled()
    expect(screen.getByText(/au moins 2 participants pour lancer/i)).toBeInTheDocument()
  })

  it('should name both shortfalls at once', () => {
    renderRoom({ participants: [participant(HOST_ID, 'Alex')], restaurantCount: 1 })
    expect(launchButton()).toBeDisabled()
    expect(screen.getByText(/2 participants et 2 restaurants/i)).toBeInTheDocument()
  })
})
