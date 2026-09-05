import { describe, expect, it } from 'vitest'

import { codeFromSlug, slugify, slugWithCode } from './slug'

describe('slugify', () => {
  it('should lowercase, strip accents and collapse separators', () => {
    expect(slugify('Restos du bureau')).toBe('restos-du-bureau')
    expect(slugify('Déj’ du vendredi — équipe #3')).toBe('dej-du-vendredi-equipe-3')
    expect(slugify('  --Sushi--  ')).toBe('sushi')
  })

  it('should truncate on a word boundary', () => {
    const slug = slugify('une liste avec un nom vraiment beaucoup trop long pour une url')
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-')).toBe(false)
    expect(slug).toBe('une-liste-avec-un-nom-vraiment-beaucoup')
  })

  it('should return an empty string when nothing is usable', () => {
    expect(slugify('!!!')).toBe('')
  })
})

describe('slugWithCode', () => {
  it('should prefix the code with a readable slug', () => {
    expect(slugWithCode('Déj du lundi', '7K3M9P')).toBe('dej-du-lundi-7K3M9P')
    expect(slugWithCode('Restos du bureau', '7K3M9P2QWX')).toBe('restos-du-bureau-7K3M9P2QWX')
  })

  it('should fall back to the bare code when the name gives no slug', () => {
    expect(slugWithCode('!!!', '7K3M9P')).toBe('7K3M9P')
    expect(slugWithCode(null, '7K3M9P')).toBe('7K3M9P')
  })
})

describe('codeFromSlug', () => {
  it('should read the code at the end of a slugged segment', () => {
    expect(codeFromSlug('dej-du-lundi-7K3M9P', 6)).toBe('7K3M9P')
    expect(codeFromSlug('restos-du-bureau-7k3m9p2qwx', 10)).toBe('7K3M9P2QWX')
  })

  it('should accept a bare code, grouped or not, with confusable letters', () => {
    expect(codeFromSlug('7K3M9P', 6)).toBe('7K3M9P')
    expect(codeFromSlug('7k3 m9p', 6)).toBe('7K3M9P')
    expect(codeFromSlug('H4V2Q-8ZX0M', 10)).toBe('H4V2Q8ZX0M')
    expect(codeFromSlug('liste-7k3m9p2qwo', 10)).toBe('7K3M9P2QW0')
  })

  it('should return null when no code of the right length ends the segment', () => {
    expect(codeFromSlug('restos-du-bureau', 10)).toBeNull()
    expect(codeFromSlug('7K3M9P2QW', 10)).toBeNull()
    expect(codeFromSlug('', 6)).toBeNull()
    // U ne fait pas partie de l'alphabet Crockford
    expect(codeFromSlug('BURGER', 6)).toBeNull()
  })
})
