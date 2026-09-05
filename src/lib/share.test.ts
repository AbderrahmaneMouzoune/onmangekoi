import { describe, expect, it } from 'vitest'

import { router } from '@/config/router.config'

import {
  parseInviteIdentifier,
  parseListParam,
  parseSessionParam,
  parseSharedListParam,
} from './share'

const TOKEN = 'a3f9b2c4d5e6f7a8b9c0d1e2f3a4b5c6'
const UUID = '3f1d2c4b-5a6e-4d7f-8a9b-0c1d2e3f4a5b'

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

describe('parseSessionParam', () => {
  it('should read the invite code at the end of a slugged link', () => {
    expect(parseSessionParam('dej-du-lundi-7K3M9P')).toEqual({ kind: 'code', value: '7K3M9P' })
    expect(parseSessionParam('7k3m9p')).toEqual({ kind: 'code', value: '7K3M9P' })
  })

  it('should still read an old uuid link', () => {
    expect(parseSessionParam(UUID)).toEqual({ kind: 'id', value: UUID })
    expect(parseSessionParam(UUID.toUpperCase())).toEqual({ kind: 'id', value: UUID })
  })

  it('should flag anything else as invalid', () => {
    expect(parseSessionParam('dej-du-lundi').kind).toBe('invalid')
    expect(parseSessionParam('').kind).toBe('invalid')
  })
})

describe('parseListParam', () => {
  it('should read the share code at the end of a slugged link', () => {
    expect(parseListParam('restos-du-bureau-7K3M9P2QWX')).toEqual({
      kind: 'code',
      value: '7K3M9P2QWX',
    })
  })

  it('should still read an old uuid link', () => {
    expect(parseListParam(UUID)).toEqual({ kind: 'id', value: UUID })
  })

  it('should not mistake a 6-char session code for a list code', () => {
    expect(parseListParam('7K3M9P').kind).toBe('invalid')
  })
})

describe('parseInviteIdentifier', () => {
  it('should normalize a short code', () => {
    expect(parseInviteIdentifier('a3f 9bo')).toEqual({ kind: 'code', value: 'A3F9B0' })
  })

  it('should read the code of a readable invite link', () => {
    expect(parseInviteIdentifier('https://onmangekoi.app/join/dej-du-lundi-7K3M9P')).toEqual({
      kind: 'code',
      value: '7K3M9P',
    })
    expect(parseInviteIdentifier('dej-du-lundi-7K3M9P')).toEqual({
      kind: 'code',
      value: '7K3M9P',
    })
  })

  it('should extract a code or token from a pasted link', () => {
    expect(parseInviteIdentifier(`https://onmangekoi.app/join/${TOKEN}`)).toEqual({
      kind: 'token',
      value: TOKEN,
    })
    expect(parseInviteIdentifier('https://onmangekoi.app/join/A3F9B2?x=1')).toEqual({
      kind: 'code',
      value: 'A3F9B2',
    })
  })

  it('should reject malformed input', () => {
    expect(parseInviteIdentifier('ABC').kind).toBe('invalid')
    expect(parseInviteIdentifier('https://onmangekoi.app/').kind).toBe('invalid')
  })
})

describe('aller-retour lien ↔ code', () => {
  const names = [
    'Déj du lundi',
    'Restos du bureau',
    '!!!',
    'a',
    'Resto 7K3M9P',
    'Une session avec un nom vraiment beaucoup trop long pour une url',
  ]

  it('should read back the code of every session link it builds', () => {
    for (const name of names) {
      const session = { name, invite_code: '7K3M9P' }
      const segment = router.session(session).replace('/sessions/', '')
      expect(parseSessionParam(segment)).toEqual({ kind: 'code', value: '7K3M9P' })
      expect(parseInviteIdentifier(router.joinInvite(session))).toEqual({
        kind: 'code',
        value: '7K3M9P',
      })
    }
  })

  it('should read back the code of every list link it builds', () => {
    for (const name of names) {
      const list = { name, share_code: 'H4V2Q8ZX0M' }
      expect(parseListParam(router.list(list).replace('/lists/', ''))).toEqual({
        kind: 'code',
        value: 'H4V2Q8ZX0M',
      })
      expect(parseSharedListParam(router.sharedList(list).replace('/l/', ''))).toEqual({
        kind: 'code',
        value: 'H4V2Q8ZX0M',
      })
    }
  })
})
