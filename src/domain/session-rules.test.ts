import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SESSION_RULES,
  describeRules,
  isDefaultRules,
  jokerBadge,
  jokerQuotas,
  jokersSentence,
  parseSessionRules,
  requiredFinishers,
  resolveRules,
} from './session-rules'

import type { SessionRules } from './session-rules'

const rules = (overrides: Partial<SessionRules> = {}): SessionRules => ({
  ...DEFAULT_SESSION_RULES,
  ...overrides,
})

describe('parseSessionRules', () => {
  it('should read the three settings', () => {
    expect(parseSessionRules({ superlikes: 2, vetos: 0, close_at_ratio: 0.8 })).toEqual({
      superlikes: 2,
      vetos: 0,
      close_at_ratio: 0.8,
    })
  })

  it('should fall back on the historical rules when the column says nothing', () => {
    expect(parseSessionRules(null)).toEqual(DEFAULT_SESSION_RULES)
    expect(parseSessionRules(undefined)).toEqual(DEFAULT_SESSION_RULES)
    expect(parseSessionRules('deux vetos')).toEqual(DEFAULT_SESSION_RULES)
    expect(parseSessionRules([1, 2])).toEqual(DEFAULT_SESSION_RULES)
  })

  it('should keep an unreadable setting at its default without dropping the others', () => {
    expect(parseSessionRules({ superlikes: 'trois', vetos: 2, close_at_ratio: 0.8 })).toEqual({
      superlikes: 1,
      vetos: 2,
      close_at_ratio: 0.8,
    })
  })

  it('should clamp a value that somehow got out of bounds', () => {
    expect(parseSessionRules({ superlikes: 42, vetos: -3, close_at_ratio: 0.1 })).toEqual({
      superlikes: 5,
      vetos: 0,
      close_at_ratio: 0.5,
    })
  })
})

describe('resolveRules', () => {
  it('should send nothing when the form kept the defaults', () => {
    expect(resolveRules({})).toBeNull()
    expect(resolveRules({ superlikes: 1, vetos: 1, closeAtRatio: 1 })).toBeNull()
  })

  it('should complete the untouched settings with their default', () => {
    expect(resolveRules({ vetos: 2 })).toEqual({ superlikes: 1, vetos: 2, close_at_ratio: 1 })
  })

  it('should carry a custom closing threshold', () => {
    expect(resolveRules({ closeAtRatio: 0.8 })).toEqual({
      superlikes: 1,
      vetos: 1,
      close_at_ratio: 0.8,
    })
  })
})

describe('requiredFinishers', () => {
  it('should ask for everyone at 100 %', () => {
    expect(requiredFinishers(5, 1)).toBe(5)
    expect(requiredFinishers(2, 1)).toBe(2)
  })

  it('should round up to the next voter', () => {
    // 80 % de 5 vaut 4,000000000000001 en virgule flottante : sans epsilon,
    // le seuil réclamerait les cinq votants.
    expect(requiredFinishers(5, 0.8)).toBe(4)
    expect(requiredFinishers(3, 0.8)).toBe(3)
    expect(requiredFinishers(10, 0.6)).toBe(6)
    expect(requiredFinishers(4, 0.5)).toBe(2)
  })

  it('should never settle for less than one voter', () => {
    expect(requiredFinishers(1, 0.5)).toBe(1)
    expect(requiredFinishers(0, 0.8)).toBe(0)
  })
})

describe('describeRules', () => {
  it('should read the default rules as they have always worked', () => {
    expect(describeRules(DEFAULT_SESSION_RULES)).toEqual([
      '1 coup de cœur',
      '1 veto',
      'Clôture quand tout le monde a voté',
    ])
  })

  it('should say a threshold and a disabled joker', () => {
    expect(describeRules(rules({ superlikes: 2, vetos: 0, close_at_ratio: 0.8 }))).toEqual([
      '2 coups de cœur',
      'Aucun veto',
      expect.stringMatching(/^Clôture dès 80/),
    ])
  })
})

describe('jokerQuotas', () => {
  it('should count what is left of each joker', () => {
    expect(jokerQuotas(rules({ superlikes: 2, vetos: 1 }), { fav: 1, veto: 0 })).toEqual({
      fav: { limit: 2, remaining: 1 },
      veto: { limit: 1, remaining: 1 },
    })
  })

  it('should never go below zero, whatever the base says', () => {
    expect(jokerQuotas(rules({ superlikes: 0 }), { fav: 1, veto: 0 }).fav).toEqual({
      limit: 0,
      remaining: 0,
    })
  })
})

describe('jokerBadge', () => {
  it('should tell a disabled joker from a spent one', () => {
    expect(jokerBadge({ limit: 0, remaining: 0 })).toBe('hors jeu')
    expect(jokerBadge({ limit: 1, remaining: 0 })).toBe('épuisé')
    expect(jokerBadge({ limit: 1, remaining: 1 })).toBe('1 restant')
    expect(jokerBadge({ limit: 3, remaining: 2 })).toBe('2 restants')
  })
})

describe('jokersSentence', () => {
  it('should announce the quotas of the session', () => {
    expect(jokersSentence(rules({ superlikes: 1, vetos: 2 }))).toBe(
      'Les jokers comptent double : 1 coup de cœur et 2 vetos pour toute la session.'
    )
  })

  it('should drop a joker that is out of play', () => {
    expect(jokersSentence(rules({ vetos: 0 }))).toBe(
      'Les jokers comptent double : 1 coup de cœur pour toute la session.'
    )
  })

  it('should say when no joker is in play at all', () => {
    expect(jokersSentence(rules({ superlikes: 0, vetos: 0 }))).toMatch(/Pas de joker/)
  })
})

describe('isDefaultRules', () => {
  it('should recognise the historical rules', () => {
    expect(isDefaultRules(DEFAULT_SESSION_RULES)).toBe(true)
    expect(isDefaultRules(rules({ vetos: 2 }))).toBe(false)
  })
})
