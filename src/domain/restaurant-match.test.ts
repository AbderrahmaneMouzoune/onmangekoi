import { describe, expect, it } from 'vitest'

import { coreName, isSameCity, isSameName, normalizeName, pickMatch } from './restaurant-match'

describe('normalizeName', () => {
  it('ignore la casse, les accents et la ponctuation', () => {
    expect(normalizeName('  Le Café-Crème ! ')).toBe('le cafe creme')
    expect(normalizeName('L’Ébauche')).toBe('l ebauche')
  })
})

describe('coreName', () => {
  it('retire les articles et le mot « restaurant »', () => {
    expect(coreName('Restaurant La Ba')).toBe('ba')
    expect(coreName("Chez l'Ami Louis")).toBe('ami louis')
  })

  it('garde le nom entier quand il ne reste rien', () => {
    expect(coreName('Le Resto')).toBe('le resto')
  })
})

describe('isSameName', () => {
  it('reconnaît un nom prononcé sans article ni majuscule', () => {
    expect(isSameName('la ba', 'La Ba')).toBe(true)
    expect(isSameName('ba', 'Restaurant La Ba')).toBe(true)
  })

  it('ne confond pas deux restos voisins', () => {
    expect(isSameName('la ba', 'La Baraka')).toBe(false)
  })
})

describe('isSameCity', () => {
  it('compare sans accents ni tirets, et jamais à vide', () => {
    expect(isSameCity('Saint-Étienne', 'saint etienne')).toBe(true)
    expect(isSameCity(null, 'Paris')).toBe(false)
  })
})

describe('pickMatch', () => {
  const laBa = { id: '1', name: 'La Ba', city: 'Paris' }
  const laBaLyon = { id: '2', name: 'La Ba', city: 'Lyon' }
  const baraka = { id: '3', name: 'La Baraka', city: 'Paris' }

  it('ne trouve rien sans candidat', () => {
    expect(pickMatch('la ba', [])).toEqual({ kind: 'none' })
  })

  it('retient le seul nom identique, même entouré de voisins', () => {
    expect(pickMatch('la ba', [baraka, laBa])).toEqual({ kind: 'match', candidate: laBa })
  })

  it('départage des homonymes par la ville', () => {
    expect(pickMatch('la ba', [laBa, laBaLyon], 'lyon')).toEqual({
      kind: 'match',
      candidate: laBaLyon,
    })
  })

  it('ne choisit pas entre deux homonymes sans ville', () => {
    expect(pickMatch('la ba', [laBa, laBaLyon])).toEqual({
      kind: 'ambiguous',
      candidates: [laBa, laBaLyon],
    })
  })

  it('laisse la personne trancher quand seul un voisin ressemble', () => {
    expect(pickMatch('la ba', [baraka])).toEqual({ kind: 'ambiguous', candidates: [baraka] })
  })
})
