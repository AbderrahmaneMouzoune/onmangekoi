import { describe, expect, it } from 'vitest'

import { VOTE_ACTIONS, formatScore, isVoteValue, voteActionByValue } from './vote'

describe('VOTE_ACTIONS', () => {
  it('should expose the four README actions with their values', () => {
    expect(VOTE_ACTIONS.map((a) => a.value)).toEqual([-2, 0, 1, 2])
    expect(VOTE_ACTIONS.filter((a) => a.joker).map((a) => a.kind)).toEqual(['veto', 'fav'])
  })
})

describe('voteActionByValue / isVoteValue', () => {
  it('should resolve known values only', () => {
    expect(voteActionByValue(2)?.kind).toBe('fav')
    expect(voteActionByValue(-1)).toBeUndefined()
    expect(isVoteValue(0)).toBe(true)
    expect(isVoteValue(3)).toBe(false)
    expect(isVoteValue('1')).toBe(false)
  })
})

describe('formatScore', () => {
  it('should sign positive and negative scores', () => {
    expect(formatScore(3)).toBe('+3')
    expect(formatScore(0)).toBe('0')
    expect(formatScore(-2)).toBe('−2')
  })
})
