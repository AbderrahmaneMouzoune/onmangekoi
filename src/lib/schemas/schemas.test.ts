import { describe, expect, it } from 'vitest'

import { LoginSchema, SetPasswordSchema } from './auth'
import { CreateListSchema } from './list'
import { PseudoSchema, SetupProfileSchema } from './profile'
import { CreateRestaurantSchema, PriceLevelSchema } from './restaurant'
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

describe('CreateRestaurantSchema', () => {
  it('should trim the name and require two characters', () => {
    expect(CreateRestaurantSchema.safeParse({ name: '  Chez Léa ' }).data?.name).toBe('Chez Léa')
    expect(CreateRestaurantSchema.safeParse({ name: ' A ' }).success).toBe(false)
    expect(CreateRestaurantSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })

  it('should normalise blank and missing optional fields to null', () => {
    const parsed = CreateRestaurantSchema.safeParse({
      name: 'Wok Garden',
      cuisineType: '   ',
      address: null,
    })
    expect(parsed.data).toMatchObject({
      cuisineType: null,
      address: null,
      city: null,
      priceLevel: null,
    })
  })

  it('should reject optional fields that are too long', () => {
    expect(
      CreateRestaurantSchema.safeParse({ name: 'Wok Garden', cuisineType: 'a'.repeat(41) }).success
    ).toBe(false)
    expect(
      CreateRestaurantSchema.safeParse({ name: 'Wok Garden', address: 'a'.repeat(201) }).success
    ).toBe(false)
  })
})

describe('PriceLevelSchema', () => {
  it('should read the four levels from a number or a form string', () => {
    expect(PriceLevelSchema.safeParse(3).data).toBe(3)
    expect(PriceLevelSchema.safeParse('2').data).toBe(2)
  })

  it('should treat an empty choice as « non renseigné »', () => {
    expect(PriceLevelSchema.safeParse('').data).toBe(null)
    expect(PriceLevelSchema.safeParse(null).data).toBe(null)
    expect(PriceLevelSchema.safeParse(undefined).data).toBe(null)
  })

  it('should reject out-of-range and non-numeric budgets', () => {
    expect(PriceLevelSchema.safeParse(0).success).toBe(false)
    expect(PriceLevelSchema.safeParse(5).success).toBe(false)
    expect(PriceLevelSchema.safeParse(1.5).success).toBe(false)
    expect(PriceLevelSchema.safeParse('cher').success).toBe(false)
  })
})
