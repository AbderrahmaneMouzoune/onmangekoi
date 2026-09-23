import { describe, expect, it } from 'vitest'

import { contrastRatio, parseHexColor, relativeLuminance } from './contrast'

describe('parseHexColor', () => {
  it('should read the three hex forms', () => {
    expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseHexColor('#1b1a17')).toEqual({ r: 27, g: 26, b: 23 })
    expect(parseHexColor('  #1B1A17FF ')).toEqual({ r: 27, g: 26, b: 23 })
  })

  it('should reject anything else', () => {
    expect(parseHexColor('rgb(0 0 0)')).toBeNull()
    expect(parseHexColor('#12345')).toBeNull()
    expect(parseHexColor('#zzzzzz')).toBeNull()
  })
})

describe('relativeLuminance', () => {
  it('should span from black to white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
  })
})

describe('contrastRatio', () => {
  it('should give 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#e8412c', '#e8412c')).toBeCloseTo(1, 5)
  })

  it('should not depend on the order of the arguments', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#767676'), 5)
    // #767676 est la limite connue du 4.5:1 sur blanc
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5)
  })

  it('should throw on an unreadable colour', () => {
    expect(() => contrastRatio('var(--ink)', '#ffffff')).toThrow(/illisible/)
  })
})
