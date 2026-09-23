import { describe, expect, it } from 'vitest'

import { compareVersions, isNewerVersion } from './version'

describe('compareVersions', () => {
  it('should order versions by number, not alphabetically', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
    expect(compareVersions('1.2.3', '1.2.10')).toBeLessThan(0)
  })

  it('should treat equal versions as equal, with or without the v prefix', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
  })

  it('should complete missing segments with zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('2', '1.9.9')).toBeGreaterThan(0)
  })

  it('should fall back to zero on anything that is not a number', () => {
    expect(compareVersions('', '0.0.0')).toBe(0)
    expect(compareVersions('next', '0.1.0')).toBeLessThan(0)
  })

  it('should sort a list from the most recent to the oldest', () => {
    const versions = ['0.9.0', '1.0.0', '0.10.2', '0.10.10']
    expect([...versions].sort((a, b) => compareVersions(b, a))).toEqual([
      '1.0.0',
      '0.10.10',
      '0.10.2',
      '0.9.0',
    ])
  })
})

describe('isNewerVersion', () => {
  it('should only be true for a strictly greater version', () => {
    expect(isNewerVersion('1.1.0', '1.0.9')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('0.9.0', '1.0.0')).toBe(false)
  })
})
