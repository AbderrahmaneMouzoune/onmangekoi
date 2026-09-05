import { describe, expect, it } from 'vitest'

import {
  countLabel,
  DELETED_PARTICIPANT,
  displayPseudo,
  initials,
  participantLabel,
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
})

describe('relativeDate', () => {
  const now = new Date('2026-09-04T12:00:00Z')

  it('should render minutes, hours and days relative to now', () => {
    expect(relativeDate('2026-09-04T11:55:00Z', now)).toMatch(/5 minutes/)
    expect(relativeDate('2026-09-04T09:00:00Z', now)).toMatch(/3 heures/)
    expect(relativeDate('2026-09-02T12:00:00Z', now)).toMatch(/avant-hier|2 jours/)
  })

  it('should render an absolute date beyond a month', () => {
    expect(relativeDate('2026-06-01T12:00:00Z', now)).toMatch(/juin/)
  })
})
