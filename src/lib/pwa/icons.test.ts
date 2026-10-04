import { describe, expect, it } from 'vitest'

import { MASKABLE_GLYPH, MASKABLE_SAFE_RADIUS, outermostReach, PWA_ICONS } from './icons'
import { buildManifest } from './manifest'

describe('PWA icons', () => {
  it('should keep the tomato dot inside the maskable safe zone', () => {
    expect(outermostReach(MASKABLE_GLYPH)).toBeLessThanOrEqual(MASKABLE_SAFE_RADIUS)
  })

  it('should not fit the safe zone at full size, hence the reduced glyph', () => {
    expect(outermostReach(1)).toBeGreaterThan(MASKABLE_SAFE_RADIUS)
  })

  it('should offer 192 and 512 px icons, both plain and maskable', () => {
    for (const purpose of ['any', 'maskable'] as const) {
      const sizes = PWA_ICONS.filter((icon) => icon.purpose === purpose).map((icon) => icon.size)
      expect(sizes).toEqual(expect.arrayContaining([192, 512]))
    }
  })
})

describe('manifest', () => {
  it('should describe an installable standalone app', () => {
    const result = buildManifest({ locale: 'fr', description: 'Décidez où manger ensemble.' })
    expect(result).toMatchObject({
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      lang: 'fr',
    })
    expect(result.icons).toContainEqual({
      src: '/icons/maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    })
  })

  it('should keep the same app identity in every language', () => {
    // Un `id` qui suivrait la langue ferait d'un changement de langue une
    // seconde application installée.
    const french = buildManifest({ locale: 'fr', description: 'fr' })
    const english = buildManifest({ locale: 'en', description: 'en' })
    expect(english.id).toBe(french.id)
    expect(english.start_url).toBe(french.start_url)
    expect(english.lang).toBe('en')
  })
})
