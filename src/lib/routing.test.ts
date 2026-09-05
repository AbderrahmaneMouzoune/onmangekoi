import { describe, expect, it } from 'vitest'

import { isProtectedPath, sanitizeNextPath } from './routing'

describe('isProtectedPath', () => {
  it('should protect session, join, list and account routes', () => {
    expect(isProtectedPath('/sessions')).toBe(true)
    expect(isProtectedPath('/sessions/abc')).toBe(true)
    expect(isProtectedPath('/join/abc')).toBe(true)
    expect(isProtectedPath('/lists/new')).toBe(true)
    expect(isProtectedPath('/l/token')).toBe(true)
    expect(isProtectedPath('/account')).toBe(true)
  })

  it('should leave public routes open', () => {
    expect(isProtectedPath('/')).toBe(false)
    expect(isProtectedPath('/setup')).toBe(false)
    expect(isProtectedPath('/login')).toBe(false)
    expect(isProtectedPath('/listsomething')).toBe(false)
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
