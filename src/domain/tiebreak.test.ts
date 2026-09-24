import { describe, expect, it } from 'vitest'

import { joinNames, readTiebreak } from './tiebreak'

import type { SessionResultRow, TiebreakState } from '@/data-access/models'

function row(name: string, tiebreak: TiebreakState | null, rank = 1): SessionResultRow {
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
    tiebreak,
  }
}

describe('readTiebreak', () => {
  it('should stay silent when a single restaurant leads', () => {
    expect(readTiebreak([row('A', null), row('B', null, 2)])).toBeNull()
  })

  it('should report an unsettled tie', () => {
    const tiebreak = readTiebreak([row('A', 'tied'), row('B', 'tied'), row('C', null, 3)])
    expect(tiebreak?.method).toBeNull()
    expect(tiebreak?.drawn).toBeNull()
    expect(tiebreak?.tied.map((r) => r.name)).toEqual(['A', 'B'])
  })

  it('should name the restaurant the draw picked', () => {
    const tiebreak = readTiebreak([row('A', 'winner'), row('B', 'loser', 2)])
    expect(tiebreak?.method).toBe('draw')
    expect(tiebreak?.drawn?.name).toBe('A')
  })

  it('should report a runoff in progress', () => {
    const tiebreak = readTiebreak([row('A', 'runoff'), row('B', 'runoff')])
    expect(tiebreak?.method).toBe('runoff')
    expect(tiebreak?.drawn).toBeNull()
  })
})

describe('joinNames', () => {
  it('should read like it is said out loud', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A et B')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B et C')
  })
})
