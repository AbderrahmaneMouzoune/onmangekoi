import { describe, expect, it } from 'vitest'

import {
  blockedLabel,
  conflictsWith,
  constraintConflicts,
  countFoodConstraints,
  hasFoodConstraints,
  NO_FOOD_CONSTRAINTS,
  ownConflictLabel,
  toConflictCounts,
} from './food-constraints'

// Les mêmes cas que `supabase/tests/profile-constraints.test.sql` : la règle
// pure et `restaurant_conflicts_with()` ne doivent jamais diverger.
describe('constraintConflicts', () => {
  it('should stay silent when neither diets nor price are known', () => {
    expect(
      constraintConflicts(
        { tags: [], price_level: null },
        { tags: ['vegan', 'halal'], maxPriceLevel: 1 }
      )
    ).toEqual([])
  })

  it('should not flag a diet when the restaurant has not declared any', () => {
    expect(
      conflictsWith({ tags: [], price_level: 2 }, { tags: ['halal'], maxPriceLevel: null })
    ).toBe(false)
  })

  it('should flag a declared diet that lacks the required one', () => {
    expect(
      constraintConflicts(
        { tags: ['vegetarian'], price_level: null },
        { tags: ['halal'], maxPriceLevel: null }
      )
    ).toEqual(['halal'])
  })

  it('should consider that a vegan restaurant serves vegetarians', () => {
    expect(
      conflictsWith(
        { tags: ['vegan'], price_level: null },
        { tags: ['vegetarian'], maxPriceLevel: null }
      )
    ).toBe(false)
  })

  it('should not consider that a vegetarian restaurant serves vegans', () => {
    expect(
      conflictsWith(
        { tags: ['vegetarian'], price_level: null },
        { tags: ['vegan'], maxPriceLevel: null }
      )
    ).toBe(true)
  })

  it('should list every missing diet, then the budget', () => {
    expect(
      constraintConflicts(
        { tags: ['halal'], price_level: 4 },
        { tags: ['halal', 'gluten_free', 'kosher'], maxPriceLevel: 2 }
      )
    ).toEqual(['gluten_free', 'kosher', 'budget'])
  })

  it('should flag a price above the budget, not equal to it', () => {
    expect(conflictsWith({ tags: [], price_level: 3 }, { tags: [], maxPriceLevel: 2 })).toBe(true)
    expect(conflictsWith({ tags: [], price_level: 2 }, { tags: [], maxPriceLevel: 2 })).toBe(false)
  })

  it('should not flag an unknown price against a budget', () => {
    expect(conflictsWith({ tags: [], price_level: null }, { tags: [], maxPriceLevel: 1 })).toBe(
      false
    )
  })

  it('should flag nothing without constraints', () => {
    expect(conflictsWith({ tags: ['halal'], price_level: 4 }, NO_FOOD_CONSTRAINTS)).toBe(false)
  })
})

describe('hasFoodConstraints / countFoodConstraints', () => {
  it('should count each diet and the budget once', () => {
    expect(countFoodConstraints({ tags: ['vegan', 'halal'], maxPriceLevel: 2 })).toBe(3)
    expect(hasFoodConstraints({ tags: [], maxPriceLevel: 1 })).toBe(true)
  })

  it('should report nothing when nothing is declared', () => {
    expect(countFoodConstraints(NO_FOOD_CONSTRAINTS)).toBe(0)
    expect(hasFoodConstraints(NO_FOOD_CONSTRAINTS)).toBe(false)
  })
})

describe('toConflictCounts', () => {
  it('should index counts by restaurant and drop empty ones', () => {
    expect(
      toConflictCounts([
        { restaurant_id: 'a', blocked_count: 2 },
        { restaurant_id: 'b', blocked_count: 0 },
      ])
    ).toEqual({ a: 2 })
  })
})

describe('blockedLabel', () => {
  it('should agree in number, without ever naming anyone', () => {
    expect(blockedLabel(1)).toBe('1 participant ne peut pas y manger')
    expect(blockedLabel(2)).toBe('2 participants ne peuvent pas y manger')
  })

  it('should say nothing when nobody is concerned', () => {
    expect(blockedLabel(0)).toBeNull()
    expect(blockedLabel(undefined)).toBeNull()
  })
})

describe('ownConflictLabel', () => {
  it('should name a single diet or the budget', () => {
    expect(ownConflictLabel(['halal'])).toBe('Pas halal')
    expect(ownConflictLabel(['gluten_free'])).toBe('Pas sans gluten')
    expect(ownConflictLabel(['budget'])).toBe('Hors budget')
  })

  it('should summarise several conflicts', () => {
    expect(ownConflictLabel(['vegan', 'budget'])).toBe('Pas pour toi')
  })

  it('should say nothing without conflict', () => {
    expect(ownConflictLabel([])).toBeNull()
  })
})
