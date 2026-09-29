import { describe, expect, it } from 'vitest'

import { decisionCandidates, headlineOf, readDecision } from './decision'

import type { SessionResultRow } from '@/data-access/models'

function row(name: string, rank: number, decided = false): SessionResultRow {
  return {
    session_restaurant_id: `sr-${name}`,
    restaurant_id: `r-${name}`,
    name,
    cuisine_type: null,
    description: null,
    photo_url: null,
    address: null,
    city: null,
    website: null,
    location: null,
    opening_hours: null,
    restaurant_position: 0,
    score: 0,
    superlikes: 0,
    likes: 0,
    dislikes: 0,
    super_dislikes: 0,
    votes_count: 0,
    rank,
    tiebreak: null,
    decided,
  }
}

describe('readDecision', () => {
  it('should stay silent when the host has not confirmed anything', () => {
    expect(readDecision([row('A', 1), row('B', 2)])).toBeNull()
  })

  it('should stay silent on an empty ranking', () => {
    expect(readDecision([])).toBeNull()
  })

  it('should follow the vote when the host confirms the winner', () => {
    const decision = readDecision([row('A', 1, true), row('B', 2)])
    expect(decision?.decided.name).toBe('A')
    expect(decision?.leader.name).toBe('A')
    expect(decision?.overridesVote).toBe(false)
  })

  it('should flag a decision the vote did not put first', () => {
    const decision = readDecision([row('A', 1), row('B', 2), row('C', 3, true)])
    expect(decision?.decided.name).toBe('C')
    expect(decision?.leader.name).toBe('A')
    expect(decision?.overridesVote).toBe(true)
  })

  it('should not treat picking a tied leader as overriding the vote', () => {
    const decision = readDecision([row('A', 1), row('B', 1, true), row('C', 3)])
    expect(decision?.decided.name).toBe('B')
    expect(decision?.overridesVote).toBe(false)
  })
})

describe('headlineOf', () => {
  it('should announce the first row when nothing is decided', () => {
    expect(headlineOf([row('A', 1), row('B', 2)])?.name).toBe('A')
  })

  it('should announce the decided row wherever it ranks', () => {
    expect(headlineOf([row('A', 1), row('B', 2), row('C', 4, true)])?.name).toBe('C')
  })

  it('should return nothing for an empty ranking', () => {
    expect(headlineOf([])).toBeUndefined()
  })
})

describe('decisionCandidates', () => {
  it('should offer every restaurant, in ranking order', () => {
    expect(decisionCandidates([row('A', 1), row('B', 2)])).toEqual([
      { restaurantId: 'r-A', name: 'A', rank: 1 },
      { restaurantId: 'r-B', name: 'B', rank: 2 },
    ])
  })
})
