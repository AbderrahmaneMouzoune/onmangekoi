import { describe, expect, it } from 'vitest'

import { CROCKFORD_ALPHABET, groupCode, isCrockford, normalizeCrockford } from './crockford'

describe('CROCKFORD_ALPHABET', () => {
  it('should hold 32 symbols without I, L, O or U', () => {
    expect(CROCKFORD_ALPHABET).toHaveLength(32)
    expect(CROCKFORD_ALPHABET).not.toMatch(/[ILOU]/)
  })
})

describe('normalizeCrockford', () => {
  it('should uppercase and drop separators', () => {
    expect(normalizeCrockford('7k3m9-p2qwx')).toBe('7K3M9P2QWX')
    expect(normalizeCrockford(' 7k3 m9p 2qwx ')).toBe('7K3M9P2QWX')
  })

  it('should map the confusable letters I, L and O', () => {
    expect(normalizeCrockford('OIlo')).toBe('0110')
    expect(normalizeCrockford('a3f9bo')).toBe('A3F9B0')
  })
})

describe('isCrockford', () => {
  it('should validate alphabet and optional length', () => {
    expect(isCrockford('7K3M9P2QWX')).toBe(true)
    expect(isCrockford('7K3M9P2QWX', 10)).toBe(true)
    expect(isCrockford('7K3M9P2QWX', 6)).toBe(false)
    expect(isCrockford('7K3M9P2QWU')).toBe(false)
    expect(isCrockford('7k3m9p2qwx')).toBe(false)
    expect(isCrockford('')).toBe(false)
  })
})

describe('groupCode', () => {
  it('should split into fixed-size groups', () => {
    expect(groupCode('7K3M9P2QWX', 5)).toBe('7K3M9-P2QWX')
    expect(groupCode('A3F9B2', 3, ' ')).toBe('A3F 9B2')
    expect(groupCode('ABC', 5)).toBe('ABC')
  })
})
