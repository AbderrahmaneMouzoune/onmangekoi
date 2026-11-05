import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  CreateSessionToolInput,
  VoteToolInput,
  listParamFromInput,
  nextStepAfterCreate,
  publicLink,
  sessionParamFromInput,
  toResults,
  toSessionDetails,
} = await import('./session-output')

import type {
  ParticipantWithProfile,
  Session,
  SessionRestaurantWithRestaurant,
  SessionResultRow,
  Vote,
} from '@/data-access/models'

/**
 * Partie pure des tools de session : lecture des liens collés, schémas JSON
 * (sans `coerce`) et surtout minimisation — ce qui part vers le LLM.
 */

const ME = '0f8fad5b-d9cb-469f-a165-70867728950e'
const HOST = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
const OTHER = '1b4e28ba-2fa1-11d2-883f-0016d3cca427'

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
    name: 'Déjeuner',
    status: 'voting',
    invite_code: '7K3M9P',
    invite_token: 'secret-token',
    results_code: 'RESULTS0001',
    results_public: false,
    host_id: HOST,
    rules: { superlikes: 2, vetos: 1, close_at_ratio: 1 },
    closes_at: null,
    closed_at: null,
    created_at: '2026-11-05T12:00:00Z',
    launched_at: '2026-11-05T12:05:00Z',
    decided_at: null,
    decided_restaurant_id: null,
    parent_session_id: null,
    tiebreak_method: null,
    tiebreak_winner_id: null,
    ...overrides,
  } as Session
}

function participant(profileId: string, pseudo: string, finished = false): ParticipantWithProfile {
  return {
    id: `p-${profileId}`,
    session_id: 's',
    profile_id: profileId,
    joined_at: '2026-11-05T12:00:00Z',
    has_finished_voting: finished,
    superlike_used: false,
    super_dislike_used: false,
    profiles: { id: profileId, pseudo },
  }
}

function sessionRestaurant(id: string, restaurantId: string, name: string) {
  return {
    id,
    session_id: 's',
    restaurant_id: restaurantId,
    position: 0,
    added_at: '2026-11-05T12:00:00Z',
    added_by: OTHER,
    restaurants: {
      id: restaurantId,
      name,
      cuisine_type: 'Thaï',
      city: 'Lyon',
      price_level: 2,
      created_by: OTHER,
    },
  } as unknown as SessionRestaurantWithRestaurant
}

function vote(sessionRestaurantId: string, value: number): Vote {
  return { session_restaurant_id: sessionRestaurantId, value } as Vote
}

describe('sessionParamFromInput', () => {
  it('should keep a bare code as is', () => {
    expect(sessionParamFromInput(' 7K3M9P ')).toBe('7K3M9P')
  })

  it('should read the code from a session, results or invite link', () => {
    expect(sessionParamFromInput('https://onmangekoi.fr/sessions/7K3M9P')).toBe('7K3M9P')
    expect(sessionParamFromInput('https://onmangekoi.fr/en/sessions/7K3M9P/results')).toBe('7K3M9P')
    expect(sessionParamFromInput('https://onmangekoi.fr/join/7K3M9P')).toBe('7K3M9P')
  })
})

describe('listParamFromInput', () => {
  it('should read the code from an owner or shared list link', () => {
    expect(listParamFromInput('https://onmangekoi.fr/lists/7K3M9P2QWX')).toBe('7K3M9P2QWX')
    expect(listParamFromInput('https://onmangekoi.fr/fr/l/7K3M9P2QWX')).toBe('7K3M9P2QWX')
    expect(listParamFromInput('7K3M9P2QWX')).toBe('7K3M9P2QWX')
  })
})

describe('CreateSessionToolInput', () => {
  it('should accept typed JSON values', () => {
    const parsed = CreateSessionToolInput.safeParse({
      name: 'Midi',
      restaurantIds: [OTHER],
      open: false,
      closesInMinutes: 30,
    })
    expect(parsed.success).toBe(true)
  })

  it('should not coerce strings into booleans or numbers', () => {
    expect(CreateSessionToolInput.safeParse({ name: 'Midi', open: 'false' }).success).toBe(false)
    expect(CreateSessionToolInput.safeParse({ name: 'Midi', superlikes: '2' }).success).toBe(false)
  })

  it('should keep the bounds of the form schema', () => {
    expect(CreateSessionToolInput.safeParse({ name: 'Midi', superlikes: 6 }).success).toBe(false)
    expect(CreateSessionToolInput.safeParse({ name: 'Midi', closeAtRatio: 0.4 }).success).toBe(
      false
    )
    expect(CreateSessionToolInput.safeParse({ name: 'Midi', closesInMinutes: 721 }).success).toBe(
      false
    )
    expect(CreateSessionToolInput.safeParse({ name: 'x'.repeat(101) }).success).toBe(false)
  })
})

describe('VoteToolInput', () => {
  it('should only accept the four vote values', () => {
    const base = { session: '7K3M9P', sessionRestaurantId: OTHER }
    for (const value of [-2, 0, 1, 2]) {
      expect(VoteToolInput.safeParse({ ...base, value }).success).toBe(true)
    }
    expect(VoteToolInput.safeParse({ ...base, value: -1 }).success).toBe(false)
    expect(VoteToolInput.safeParse({ ...base, value: '2' }).success).toBe(false)
  })
})

describe('toSessionDetails', () => {
  const details = toSessionDetails({
    session: session(),
    userId: ME,
    participants: [participant(HOST, 'Alice', true), participant(ME, 'Moi')],
    restaurants: [
      sessionRestaurant('sr-1', 'r-1', 'Bangkok Street'),
      sessionRestaurant('sr-2', 'r-2', 'Pho 24'),
      sessionRestaurant('sr-3', 'r-3', 'Chez Paul'),
    ],
    votes: [vote('sr-1', 2), vote('sr-2', -2)],
    conflicts: [{ restaurant_id: 'r-3', blocked_count: 2 }],
    runoff: null,
  })

  it('should never expose secrets nor participant uuids', () => {
    const json = JSON.stringify(details)
    expect(json).not.toContain('secret-token')
    expect(json).not.toContain('RESULTS0001')
    expect(json).not.toContain(HOST)
    expect(json).not.toContain(OTHER)
    expect(json).not.toContain(ME)
  })

  it('should describe participants by nickname and role', () => {
    expect(details.participants).toEqual([
      { pseudo: 'Alice', is_me: false, is_host: true, finished_voting: true },
      { pseudo: 'Moi', is_me: true, is_host: false, finished_voting: false },
    ])
    expect(details.is_host).toBe(false)
    expect(details.participant_count).toBe(2)
    expect(details.finished_count).toBe(1)
  })

  it('should give the ids needed to vote, my votes and the conflicts', () => {
    expect(details.restaurants[0]).toEqual({
      session_restaurant_id: 'sr-1',
      restaurant_id: 'r-1',
      name: 'Bangkok Street',
      cuisine_type: 'Thaï',
      city: 'Lyon',
      price_level: 2,
      my_vote: 2,
      participants_who_cannot_eat_here: 0,
    })
    expect(details.restaurants[2]?.my_vote).toBeNull()
    expect(details.restaurants[2]?.participants_who_cannot_eat_here).toBe(2)
    expect(details.my_progress).toEqual({ voted: 2, remaining: 1, finished: false })
  })

  it('should count the jokers left from my own votes', () => {
    expect(details.jokers_remaining).toEqual({ superlikes: 1, vetos: 0 })
    expect(details.rules).toEqual({
      superlikes: 2,
      vetos: 1,
      close_at_ratio: 1,
      open: false,
      duo: false,
    })
  })

  it('should give absolute links, and no results link before closing', () => {
    expect(details.session_url).toBe('https://onmangekoi.test/sessions/7K3M9P')
    expect(details.invite_url).toBe('https://onmangekoi.test/join/7K3M9P')
    expect(details.results_url).toBeNull()
    expect(details.public_results_url).toBeNull()
  })
})

describe('publicLink', () => {
  it('should only exist for a closed session whose ranking the host made public', () => {
    expect(publicLink(session({ status: 'closed', results_public: true }))).toBe(
      'https://onmangekoi.test/r/RESULTS0001'
    )
    expect(publicLink(session({ status: 'closed', results_public: false }))).toBeNull()
    expect(publicLink(session({ status: 'voting', results_public: true }))).toBeNull()
  })
})

describe('toResults', () => {
  const row = (overrides: Partial<SessionResultRow>): SessionResultRow =>
    ({
      rank: 1,
      score: 3,
      restaurant_id: 'r-1',
      session_restaurant_id: 'sr-1',
      name: 'Bangkok Street',
      cuisine_type: 'Thaï',
      city: 'Lyon',
      superlikes: 1,
      likes: 1,
      dislikes: 0,
      super_dislikes: 0,
      votes_count: 2,
      decided: false,
      tiebreak: null,
      ...overrides,
    }) as SessionResultRow

  it('should report an unavailable ranking while the session is open', () => {
    const results = toResults(session(), [])
    expect(results.available).toBe(false)
    expect(results.ranking).toEqual([])
    expect(results.decision).toBeNull()
  })

  it('should map the aggregated ranking and the decision', () => {
    const results = toResults(session({ status: 'closed' }), [
      row({}),
      row({ rank: 2, score: 1, restaurant_id: 'r-2', name: 'Pho 24', decided: true }),
    ])
    expect(results.available).toBe(true)
    expect(results.ranking[0]).toMatchObject({ rank: 1, favourites: 1, vetoes: 0 })
    expect(results.decision).toEqual({ restaurant_id: 'r-2', name: 'Pho 24' })
    expect(results.results_url).toBe('https://onmangekoi.test/sessions/7K3M9P/results')
  })
})

describe('nextStepAfterCreate', () => {
  it('should remind the host to launch a waiting session', () => {
    expect(nextStepAfterCreate(session({ status: 'waiting' }))).toContain('launch_session')
    expect(nextStepAfterCreate(session({ status: 'voting' }))).not.toContain('launch_session')
  })
})
