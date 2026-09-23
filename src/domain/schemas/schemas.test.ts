import { describe, expect, it } from 'vitest'

import { LoginSchema, SetPasswordSchema } from './auth'
import { CreateGroupSchema, RenameGroupSchema } from './group'
import { CreateListSchema } from './list'
import { ImportPlaceSchema, SearchPlacesSchema } from './place'
import { PseudoSchema, SetupProfileSchema } from './profile'
import { CreateRestaurantSchema, PriceLevelSchema, RestaurantTagsSchema } from './restaurant'
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

describe('CreateGroupSchema', () => {
  it('should require a name and the session it comes from', () => {
    expect(CreateGroupSchema.safeParse({ name: 'Le midi', sessionId: UUID }).success).toBe(true)
    expect(CreateGroupSchema.safeParse({ name: '  ', sessionId: UUID }).success).toBe(false)
    expect(CreateGroupSchema.safeParse({ name: 'Le midi', sessionId: 'nope' }).success).toBe(false)
    expect(CreateGroupSchema.safeParse({ name: 'x'.repeat(61), sessionId: UUID }).success).toBe(
      false
    )
  })

  it('should trim the name, as the database does', () => {
    expect(CreateGroupSchema.safeParse({ name: '  Le midi ', sessionId: UUID }).data?.name).toBe(
      'Le midi'
    )
  })

  it('should require a name to rename', () => {
    expect(RenameGroupSchema.safeParse({ groupId: UUID, name: 'Autre' }).success).toBe(true)
    expect(RenameGroupSchema.safeParse({ groupId: UUID }).success).toBe(false)
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

  it('should accept groups to pre-invite, and bound how many', () => {
    const base = { name: 'Lunch', restaurantIds: [UUID] }
    expect(CreateSessionSchema.safeParse(base).data?.groupIds).toEqual([])
    expect(CreateSessionSchema.safeParse({ ...base, groupIds: [UUID] }).success).toBe(true)
    expect(CreateSessionSchema.safeParse({ ...base, groupIds: Array(6).fill(UUID) }).success).toBe(
      false
    )
    // Un groupe ne remplace pas un restaurant : il faut toujours de quoi voter.
    expect(CreateSessionSchema.safeParse({ name: 'Lunch', groupIds: [UUID] }).success).toBe(false)
  })

  it('should read the deadline fields a form leaves empty or absent', () => {
    const base = { name: 'Lunch', restaurantIds: [UUID] }
    const parsed = CreateSessionSchema.safeParse({
      ...base,
      closesInMinutes: null,
      closesAt: '',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.closesInMinutes).toBeUndefined()
    expect(parsed.data?.closesAt).toBeUndefined()

    expect(
      CreateSessionSchema.safeParse({ ...base, closesInMinutes: '10' }).data?.closesInMinutes
    ).toBe(10)
  })

  it('should bound the deadline like the database does', () => {
    const base = { name: 'Lunch', restaurantIds: [UUID] }
    expect(CreateSessionSchema.safeParse({ ...base, closesInMinutes: 0 }).success).toBe(false)
    expect(CreateSessionSchema.safeParse({ ...base, closesInMinutes: 721 }).success).toBe(false)
    expect(CreateSessionSchema.safeParse({ ...base, closesAt: 'demain midi' }).success).toBe(false)
  })

  it('should read the anti-fatigue box, checked as unchecked', () => {
    const base = { name: 'Lunch', restaurantIds: [UUID] }
    // Cochée, le navigateur envoie « on » ; décochée, il n'envoie rien.
    expect(
      CreateSessionSchema.safeParse({ ...base, excludeRecentWinners: 'on' }).data
        ?.excludeRecentWinners
    ).toBe(true)
    expect(
      CreateSessionSchema.safeParse({ ...base, excludeRecentWinners: null }).data
        ?.excludeRecentWinners
    ).toBe(false)
    expect(CreateSessionSchema.safeParse(base).data?.excludeRecentWinners).toBeUndefined()
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
      tags: [],
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

describe('RestaurantTagsSchema', () => {
  it('should keep the known diets, once each', () => {
    expect(RestaurantTagsSchema.safeParse(['vegan', 'vegan', 'halal']).data).toEqual([
      'vegan',
      'halal',
    ])
  })

  it('should treat a missing choice as « aucun régime »', () => {
    expect(RestaurantTagsSchema.safeParse(null).data).toEqual([])
    expect(RestaurantTagsSchema.safeParse(undefined).data).toEqual([])
  })

  it('should reject a diet the base would refuse anyway', () => {
    expect(RestaurantTagsSchema.safeParse(['pizza']).success).toBe(false)
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

describe('SearchPlacesSchema', () => {
  it('should trim the query and require two characters', () => {
    expect(SearchPlacesSchema.safeParse({ query: '  sushi ' }).data?.query).toBe('sushi')
    expect(SearchPlacesSchema.safeParse({ query: ' a ' }).success).toBe(false)
    expect(SearchPlacesSchema.safeParse({ query: 'a'.repeat(121) }).success).toBe(false)
  })

  it('should accept a search with no geographic bias', () => {
    expect(SearchPlacesSchema.safeParse({ query: 'sushi' }).success).toBe(true)
    expect(
      SearchPlacesSchema.safeParse({ query: 'sushi', latitude: null, longitude: null }).success
    ).toBe(true)
  })

  it('should reject coordinates outside the globe', () => {
    expect(SearchPlacesSchema.safeParse({ query: 'sushi', latitude: 91 }).success).toBe(false)
    expect(SearchPlacesSchema.safeParse({ query: 'sushi', longitude: -181 }).success).toBe(false)
    expect(SearchPlacesSchema.safeParse({ query: 'sushi', latitude: '45' }).success).toBe(false)
  })

  it('should accept no text at all when a position is given: that is « autour de moi »', () => {
    const nearby = SearchPlacesSchema.safeParse({ latitude: 45.76, longitude: 4.83 })
    expect(nearby.success).toBe(true)
    expect(nearby.data?.query).toBe('')
    expect(
      SearchPlacesSchema.safeParse({ query: ' ', latitude: 45.76, longitude: 4.83 }).success
    ).toBe(true)
  })

  it('should carry an opaque page token, and refuse a garbled one', () => {
    expect(
      SearchPlacesSchema.safeParse({ query: 'sushi', pageToken: 'AbC_-123' }).data?.pageToken
    ).toBe('AbC_-123')
    expect(SearchPlacesSchema.safeParse({ query: 'sushi', pageToken: null }).success).toBe(true)
    expect(SearchPlacesSchema.safeParse({ query: 'sushi', pageToken: '' }).success).toBe(false)
    expect(SearchPlacesSchema.safeParse({ query: 'sushi', pageToken: 'a b' }).success).toBe(false)
    expect(
      SearchPlacesSchema.safeParse({ query: 'sushi', pageToken: 'a'.repeat(4097) }).success
    ).toBe(false)
  })

  it('should refuse a search with neither text nor position', () => {
    const empty = SearchPlacesSchema.safeParse({ query: '' })
    expect(empty.success).toBe(false)
    expect(empty.error?.issues[0]?.message).toMatch(/autorise ta position/)
    expect(SearchPlacesSchema.safeParse({ query: 'a', latitude: 45.76 }).success).toBe(false)
  })
})

describe('ImportPlaceSchema', () => {
  it('should accept a Google place id and refuse anything else', () => {
    expect(ImportPlaceSchema.safeParse({ placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4' }).success).toBe(
      true
    )
    expect(ImportPlaceSchema.safeParse({ placeId: '' }).success).toBe(false)
    expect(ImportPlaceSchema.safeParse({ placeId: '../etc/passwd' }).success).toBe(false)
    expect(ImportPlaceSchema.safeParse({ placeId: 'a b' }).success).toBe(false)
    expect(ImportPlaceSchema.safeParse({ placeId: 'a'.repeat(256) }).success).toBe(false)
  })
})
