import { describe, expect, it } from 'vitest'

import { PROTECTED_PREFIXES } from '@/config/router.config'

import { isProtectedPath, needsSessionRefresh, sanitizeNextPath } from './routing'

describe('isProtectedPath', () => {
  it('should protect session, duo, join, list and account routes', () => {
    expect(isProtectedPath('/sessions')).toBe(true)
    expect(isProtectedPath('/duo')).toBe(true)
    expect(isProtectedPath('/sessions/abc')).toBe(true)
    expect(isProtectedPath('/join/abc')).toBe(true)
    expect(isProtectedPath('/lists/new')).toBe(true)
    expect(isProtectedPath('/account')).toBe(true)
  })

  it('should leave public routes open', () => {
    expect(isProtectedPath('/')).toBe(false)
    expect(isProtectedPath('/setup')).toBe(false)
    expect(isProtectedPath('/login')).toBe(false)
    expect(isProtectedPath('/listsomething')).toBe(false)
    expect(isProtectedPath('/duos')).toBe(false)
  })

  it('should let a shared list through — the page decides, list by list', () => {
    // Une liste publique se montre sans pseudo ; une liste privée renvoie
    // elle-même vers l'onboarding, depuis la page et non depuis le proxy.
    expect(isProtectedPath('/l/H4V2Q8ZX0M')).toBe(false)
  })
})

describe('needsSessionRefresh', () => {
  it('should refresh the Supabase session on every protected route', () => {
    for (const prefix of PROTECTED_PREFIXES) {
      expect(needsSessionRefresh(prefix)).toBe(true)
      expect(needsSessionRefresh(`${prefix}/ABC`)).toBe(true)
    }
  })

  it('should refresh it where the user is read without being required', () => {
    expect(needsSessionRefresh('/setup')).toBe(true)
    expect(needsSessionRefresh('/login')).toBe(true)
    expect(needsSessionRefresh('/l/H4V2Q8ZX0M')).toBe(true)
    expect(needsSessionRefresh('/auth/confirm')).toBe(true)
  })

  it('should leave the static pages alone', () => {
    expect(needsSessionRefresh('/')).toBe(false)
    expect(needsSessionRefresh('/r/H4V2Q8ZX0M')).toBe(false)
    expect(needsSessionRefresh('/nouveautes')).toBe(false)
    expect(needsSessionRefresh('/offline')).toBe(false)
  })
})

describe('sanitizeNextPath', () => {
  it('should accept internal absolute paths', () => {
    expect(sanitizeNextPath('/sessions/abc')).toBe('/sessions/abc')
    expect(sanitizeNextPath('/join/abc?x=1')).toBe('/join/abc?x=1')
  })

  it('should reject open redirects and relative paths', () => {
    expect(sanitizeNextPath('https://evil.com')).toBe('/')
    expect(sanitizeNextPath('//evil.com')).toBe('/')
    expect(sanitizeNextPath('/\\evil.com')).toBe('/')
    expect(sanitizeNextPath('sessions/abc')).toBe('/')
    expect(sanitizeNextPath('/foo\nSet-Cookie: x')).toBe('/')
  })

  it('should fall back when empty or too long', () => {
    expect(sanitizeNextPath(null, '/lists')).toBe('/lists')
    expect(sanitizeNextPath('', '/lists')).toBe('/lists')
    expect(sanitizeNextPath(`/${'a'.repeat(600)}`)).toBe('/')
  })
})
