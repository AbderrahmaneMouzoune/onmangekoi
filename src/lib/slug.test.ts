import { describe, expect, it } from 'vitest'

import { slugify } from './slug'

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
