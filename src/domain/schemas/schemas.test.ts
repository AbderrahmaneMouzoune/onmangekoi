import { describe, expect, it } from 'vitest'

import { LoginSchema, SetPasswordSchema } from './auth'
import { CreateListSchema } from './list'
import { PseudoSchema, SetupProfileSchema } from './profile'
import { CreateSessionSchema, JoinSessionSchema } from './session'
import { SubmitVoteSchema } from './vote'

const UUID = '3f1d2c4b-5a6e-4d7f-8a9b-0c1d2e3f4a5b'

describe('PseudoSchema', () => {
  it('should accept accented letters, digits, spaces, dashes and underscores', () => {
    expect(PseudoSchema.safeParse('Zoé-Léa_2').success).toBe(true)
    expect(PseudoSchema.safeParse('  Alex  ').data).toBe('Alex')
  })

  it('should reject symbols and out-of-range lengths', () => {
    expect(PseudoSchema.safeParse('A').success).toBe(false)
    expect(PseudoSchema.safeParse('a'.repeat(31)).success).toBe(false)
    expect(PseudoSchema.safeParse('<script>').success).toBe(false)
    expect(PseudoSchema.safeParse('alex@mail').success).toBe(false)
  })

  it('should not treat « Anonyme » specially anymore', () => {
    expect(SetupProfileSchema.safeParse({ pseudo: 'Anonyme' }).success).toBe(true)
  })
})

describe('CreateSessionSchema', () => {
  it('should require at least one list or restaurant', () => {
    expect(CreateSessionSchema.safeParse({ name: 'Lunch' }).success).toBe(false)
    expect(CreateSessionSchema.safeParse({ name: 'Lunch', restaurantIds: [UUID] }).success).toBe(
      true
    )
    expect(CreateSessionSchema.safeParse({ name: 'Lunch', listIds: [UUID] }).success).toBe(true)
  })

  it('should reject non-uuid ids and empty names', () => {
    expect(CreateSessionSchema.safeParse({ name: '  ', restaurantIds: [UUID] }).success).toBe(false)
    expect(CreateSessionSchema.safeParse({ name: 'Lunch', restaurantIds: ['nope'] }).success).toBe(
      false
    )
  })
})

describe('JoinSessionSchema', () => {
  it('should trim and require an identifier', () => {
    expect(JoinSessionSchema.safeParse({ identifier: '  A3F9B2 ' }).data?.identifier).toBe('A3F9B2')
    expect(JoinSessionSchema.safeParse({ identifier: '' }).success).toBe(false)
  })
})

describe('SubmitVoteSchema', () => {
  it('should only accept the four vote values', () => {
    for (const value of [-2, 0, 1, 2]) {
      expect(
        SubmitVoteSchema.safeParse({ sessionId: UUID, sessionRestaurantId: UUID, value }).success
      ).toBe(true)
    }
    for (const value of [-1, 3, '1', null]) {
      expect(
        SubmitVoteSchema.safeParse({ sessionId: UUID, sessionRestaurantId: UUID, value }).success
      ).toBe(false)
    }
  })
})

describe('auth schemas', () => {
  it('should lowercase and trim emails', () => {
    expect(LoginSchema.safeParse({ email: '  Alex@Mail.FR ', password: 'x' }).data?.email).toBe(
      'alex@mail.fr'
    )
  })

  it('should require matching passwords of at least 8 characters', () => {
    expect(SetPasswordSchema.safeParse({ password: 'short', confirm: 'short' }).success).toBe(false)
    expect(
      SetPasswordSchema.safeParse({ password: 'longenough', confirm: 'different' }).success
    ).toBe(false)
    expect(
      SetPasswordSchema.safeParse({ password: 'longenough', confirm: 'longenough' }).success
    ).toBe(true)
  })
})

describe('CreateListSchema', () => {
  it('should cap the name at 60 characters and default restaurants to []', () => {
    expect(CreateListSchema.safeParse({ name: 'a'.repeat(61) }).success).toBe(false)
    expect(CreateListSchema.safeParse({ name: 'Bureau' }).data?.restaurantIds).toEqual([])
  })
})
