import { describe, expect, it } from 'vitest'

import { formatInviteCode, normalizeInviteInput } from './invite'

const TOKEN = 'a3f9b2c4d5e6f7a8b9c0d1e2f3a4b5c6'

describe('normalizeInviteInput', () => {
  it('should accept a 6-char code in any case, with spaces or dashes', () => {
    expect(normalizeInviteInput('a3f9b2')).toEqual({ kind: 'code', value: 'A3F9B2' })
    expect(normalizeInviteInput('  A3F 9B2 ')).toEqual({ kind: 'code', value: 'A3F9B2' })
    expect(normalizeInviteInput('A3F-9B2')).toEqual({ kind: 'code', value: 'A3F9B2' })
  })

  it('should accept a 32-hex token', () => {
    expect(normalizeInviteInput(TOKEN.toUpperCase())).toEqual({ kind: 'token', value: TOKEN })
  })

  it('should extract the identifier from a pasted link', () => {
    expect(normalizeInviteInput(`https://onmangekoi.app/join/${TOKEN}`)).toEqual({
      kind: 'token',
      value: TOKEN,
    })
    expect(normalizeInviteInput(`http://localhost:3000/join/${TOKEN}?utm=x#top`)).toEqual({
      kind: 'token',
      value: TOKEN,
    })
    expect(normalizeInviteInput('https://onmangekoi.app/join/A3F9B2')).toEqual({
      kind: 'code',
      value: 'A3F9B2',
    })
    expect(normalizeInviteInput('/join/A3F9B2')).toEqual({ kind: 'code', value: 'A3F9B2' })
  })

  it('should flag anything else as invalid', () => {
    expect(normalizeInviteInput('')).toEqual({ kind: 'invalid', value: '' })
    expect(normalizeInviteInput('ABC')).toEqual({ kind: 'invalid', value: 'ABC' })
    expect(normalizeInviteInput('https://onmangekoi.app/').kind).toBe('invalid')
    expect(normalizeInviteInput('ZZZZZZZ').kind).toBe('invalid')
  })
})

describe('formatInviteCode', () => {
  it('should split a code in two blocks of three', () => {
    expect(formatInviteCode('a3f9b2')).toBe('A3F 9B2')
  })

  it('should leave malformed codes untouched', () => {
    expect(formatInviteCode('ABCD')).toBe('ABCD')
  })
})
