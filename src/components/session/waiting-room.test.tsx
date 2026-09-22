// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WaitingRoom } from './waiting-room'

import type {
  ParticipantWithProfile,
  Session,
  SessionRestaurantWithRestaurant,
} from '@/data-access/models'

// Les Server Actions ne s'exécutent pas dans jsdom : seul leur appel compte ici.
vi.mock('@/actions/sessions', () => ({
  deleteSessionAction: vi.fn(),
  launchSessionAction: vi.fn(),
  leaveSessionAction: vi.fn(),
}))

// Le panneau des restos et les invités en attente ont leur propre couverture :
// ici, seul le bouton de lancement est en jeu.
vi.mock('@/components/session/session-restaurants-panel', () => ({
  SessionRestaurantsPanel: () => null,
}))
vi.mock('@/components/session/pending-invitees', () => ({
  PendingInvitees: () => null,
}))

const HOST_ID = '11111111-1111-4111-8111-111111111111'
const GUEST_ID = '22222222-2222-4222-8222-222222222222'

const session: Session = {
  closed_at: null,
  closes_at: null,
  created_at: '2026-09-21T12:00:00Z',
  host_id: HOST_ID,
  id: '33333333-3333-4333-8333-333333333333',
  invite_code: 'ABC123',
  invite_token: 'f'.repeat(32),
  launched_at: null,
  name: 'Lunch du vendredi',
  results_code: 'H4V2Q8ZX0M',
  results_public: false,
  status: 'waiting',
}

function participant(profileId: string, pseudo: string): ParticipantWithProfile {
  return {
    has_finished_voting: false,
    id: `p-${profileId}`,
    joined_at: '2026-09-21T12:00:00Z',
    profile_id: profileId,
    session_id: session.id,
    super_dislike_used: false,
    superlike_used: false,
    profiles: { id: profileId, pseudo },
  }
}

function restaurant(id: string, position: number): SessionRestaurantWithRestaurant {
  return {
    id: `sr-${id}`,
    session_id: session.id,
    restaurant_id: id,
    position,
    added_at: '2026-09-21T12:00:00Z',
    added_by: HOST_ID,
    restaurants: null,
  }
}

const TWO_RESTAURANTS = [restaurant('resto-1', 0), restaurant('resto-2', 1)]

function renderRoom({
  participants = [participant(HOST_ID, 'Alex'), participant(GUEST_ID, 'Sam')],
  restaurants = TWO_RESTAURANTS,
}: {
  participants?: ParticipantWithProfile[]
  restaurants?: SessionRestaurantWithRestaurant[]
} = {}) {
  return render(
    <WaitingRoom
      session={session}
      participants={participants}
      meId={HOST_ID}
      isHost
      inviteUrl="https://onmangekoi.test/j/ABC123"
      qrSvg={null}
      restaurants={restaurants}
      restaurantCatalog={null}
      connection="live"
      invitations={[]}
      groups={[]}
      onLaunched={vi.fn()}
      onRestaurantsChanged={vi.fn()}
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
    renderRoom({ restaurants: [restaurant('resto-1', 0)] })
    expect(launchButton()).toBeDisabled()
    expect(screen.getByText(/rien à départager/i)).toBeInTheDocument()
  })

  it('should block the launch while the host is alone', () => {
    renderRoom({ participants: [participant(HOST_ID, 'Alex')] })
    expect(launchButton()).toBeDisabled()
    expect(screen.getByText(/au moins 2 participants pour lancer/i)).toBeInTheDocument()
  })

  it('should name both shortfalls at once', () => {
    renderRoom({
      participants: [participant(HOST_ID, 'Alex')],
      restaurants: [restaurant('resto-1', 0)],
    })
    expect(launchButton()).toBeDisabled()
    expect(screen.getByText(/2 participants et 2 restos/i)).toBeInTheDocument()
  })
})
