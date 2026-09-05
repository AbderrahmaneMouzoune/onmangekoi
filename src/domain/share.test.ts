import { describe, expect, it } from 'vitest'

import { parseInviteIdentifier, parseSharedListParam } from './share'

const TOKEN = 'a3f9b2c4d5e6f7a8b9c0d1e2f3a4b5c6'

describe('parseSharedListParam', () => {
  it('should read the code at the end of a slugged link', () => {
    expect(parseSharedListParam('restos-du-bureau-7K3M9P2QWX')).toEqual({
      kind: 'code',
      value: '7K3M9P2QWX',
    })
  })

  it('should accept a bare code, in any case, with confusable letters', () => {
    expect(parseSharedListParam('7K3M9P2QWX')).toEqual({ kind: 'code', value: '7K3M9P2QWX' })
    expect(parseSharedListParam('7k3m9p2qwx')).toEqual({ kind: 'code', value: '7K3M9P2QWX' })
    expect(parseSharedListParam('liste-7k3m9p2qwo')).toEqual({ kind: 'code', value: '7K3M9P2QW0' })
  })

  it('should still accept a legacy 32-hex token', () => {
    expect(parseSharedListParam(TOKEN.toUpperCase())).toEqual({ kind: 'token', value: TOKEN })
  })

  it('should flag anything else as invalid', () => {
    expect(parseSharedListParam('restos-du-bureau').kind).toBe('invalid')
    expect(parseSharedListParam('7K3M9P2QW').kind).toBe('invalid')
    expect(parseSharedListParam('').kind).toBe('invalid')
  })
})

describe('parseInviteIdentifier', () => {
  it('should normalize a short code whatever the case and separators', () => {
    expect(parseInviteIdentifier('a3f9b2')).toEqual({ kind: 'code', value: 'A3F9B2' })
    expect(parseInviteIdentifier('  A3F 9B2 ')).toEqual({ kind: 'code', value: 'A3F9B2' })
    expect(parseInviteIdentifier('A3F-9B2')).toEqual({ kind: 'code', value: 'A3F9B2' })
  })

  it('should read confusable letters as digits', () => {
    expect(parseInviteIdentifier('a3f9bo')).toEqual({ kind: 'code', value: 'A3F9B0' })
    expect(parseInviteIdentifier('IL0O12')).toEqual({ kind: 'code', value: '110012' })
  })

  it('should still accept a legacy 32-hex token', () => {
    expect(parseInviteIdentifier(TOKEN.toUpperCase())).toEqual({ kind: 'token', value: TOKEN })
  })

  it('should extract a code or token from a pasted link', () => {
    expect(parseInviteIdentifier(`https://onmangekoi.app/join/${TOKEN}`)).toEqual({
      kind: 'token',
      value: TOKEN,
    })
    expect(parseInviteIdentifier(`http://localhost:3000/join/${TOKEN}?utm=x#top`)).toEqual({
      kind: 'token',
      value: TOKEN,
    })
    expect(parseInviteIdentifier('https://onmangekoi.app/join/A3F9B2?x=1')).toEqual({
      kind: 'code',
      value: 'A3F9B2',
    })
    expect(parseInviteIdentifier('/join/A3F9B2')).toEqual({ kind: 'code', value: 'A3F9B2' })
  })

  it('should reject malformed input', () => {
    expect(parseInviteIdentifier('').kind).toBe('invalid')
    expect(parseInviteIdentifier('ABC').kind).toBe('invalid')
    expect(parseInviteIdentifier('ZZZZZZZ').kind).toBe('invalid')
    expect(parseInviteIdentifier('https://onmangekoi.app/').kind).toBe('invalid')
  })
})
