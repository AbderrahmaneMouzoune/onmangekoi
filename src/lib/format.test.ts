import { describe, expect, it } from 'vitest'

import {
  countLabel,
  DELETED_PARTICIPANT,
  displayPseudo,
  initials,
  participantLabel,
  percentLabel,
  plural,
  relativeDate,
} from './format'

describe('plural / countLabel', () => {
  it('should pluralize above one', () => {
    expect(plural(0, 'resto')).toBe('resto')
    expect(plural(1, 'resto')).toBe('resto')
    expect(plural(2, 'resto')).toBe('restos')
    expect(countLabel(3, 'participant')).toBe('3 participants')
  })

  it('should accept an irregular plural', () => {
    expect(plural(2, 'cheval', 'chevaux')).toBe('chevaux')
  })
})

describe('initials', () => {
  it('should take the first letter of the first and last words', () => {
    expect(initials('Alex')).toBe('A')
    expect(initials('Alex Dupont')).toBe('AD')
    expect(initials('  jean  paul  martin ')).toBe('JM')
  })

  it('should fall back on empty input', () => {
    expect(initials('')).toBe('?')
    expect(initials(null, '·')).toBe('·')
  })
})

describe('displayPseudo', () => {
  it('should fall back to Invité when the pseudo is missing', () => {
    expect(displayPseudo(null)).toBe('Invité')
    expect(displayPseudo('   ')).toBe('Invité')
    expect(displayPseudo(' Sam ')).toBe('Sam')
  })

  it('should use the translated guest label it is given', () => {
    expect(displayPseudo(null, 'Guest')).toBe('Guest')
    expect(displayPseudo('Sam', 'Guest')).toBe('Sam')
  })
})

describe('participantLabel', () => {
  it('should name a participant whose account was deleted', () => {
    expect(participantLabel(null, null)).toBe(DELETED_PARTICIPANT)
    // Le pseudo ne devrait plus exister, mais un cache périmé ne doit pas
    // ressusciter l'auteur d'un vote anonymisé.
    expect(participantLabel(null, 'Sam')).toBe(DELETED_PARTICIPANT)
  })

  it('should not confuse a deleted account with a guest without a pseudo', () => {
    expect(participantLabel('user-1', null)).toBe('Invité')
    expect(participantLabel('user-1', '  ')).toBe('Invité')
    expect(participantLabel('user-1', 'Sam')).toBe('Sam')
  })

  it('should use the translated labels it is given', () => {
    const labels = { guest: 'Guest', deletedParticipant: 'Deleted participant' }
    expect(participantLabel(null, 'Sam', labels)).toBe('Deleted participant')
    expect(participantLabel('user-1', null, labels)).toBe('Guest')
  })
})

describe('percentLabel', () => {
  it('should render a ratio as a rounded percentage', () => {
    // L'espace avant le % dépend de la locale ICU : on ne teste que le chiffre.
    expect(percentLabel(0.42, 'fr')).toMatch(/^42\s*%$/)
    expect(percentLabel(0, 'fr')).toMatch(/^0\s*%$/)
    expect(percentLabel(1, 'fr')).toMatch(/^100\s*%$/)
    expect(percentLabel(0.128, 'fr')).toMatch(/^13\s*%$/)
  })

  it('should glue the sign to the number in English', () => {
    expect(percentLabel(0.42, 'en')).toBe('42%')
  })
})

describe('relativeDate', () => {
  const now = new Date('2026-09-04T12:00:00Z')

  it('should render minutes, hours and days relative to now', () => {
    expect(relativeDate('2026-09-04T11:55:00Z', 'fr', now)).toMatch(/5 minutes/)
    expect(relativeDate('2026-09-04T09:00:00Z', 'fr', now)).toMatch(/3 heures/)
    expect(relativeDate('2026-09-02T12:00:00Z', 'fr', now)).toMatch(/avant-hier|2 jours/)
  })

  it('should render an absolute date beyond a month', () => {
    expect(relativeDate('2026-06-01T12:00:00Z', 'fr', now)).toMatch(/juin/)
  })

  it('should speak English when asked to', () => {
    expect(relativeDate('2026-09-04T11:55:00Z', 'en', now)).toBe('5 minutes ago')
    expect(relativeDate('2026-09-03T12:00:00Z', 'en', now)).toBe('yesterday')
    expect(relativeDate('2026-06-01T12:00:00Z', 'en', now)).toMatch(/Jun/)
  })

  it('should date in the Paris time zone, whatever the server runs on', () => {
    // 23 h 30 UTC le 31 mai, c'est déjà le 1er juin à Paris.
    expect(relativeDate('2026-05-31T23:30:00Z', 'fr', now)).toMatch(/^1 juin/)
  })
})
