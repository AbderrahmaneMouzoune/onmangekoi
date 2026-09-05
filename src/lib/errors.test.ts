import { describe, expect, it } from 'vitest'

import { AppError, GENERIC_ERROR, OMK_MESSAGES, omkCode, toUserMessage } from './errors'

describe('omkCode', () => {
  it('should extract the code from a database business error', () => {
    expect(omkCode({ message: 'omk:session_started' })).toBe('session_started')
    expect(omkCode(new Error('omk:host_only'))).toBe('host_only')
    expect(omkCode('omk:invalid_vote')).toBe('invalid_vote')
  })

  it('should return null for technical errors', () => {
    expect(omkCode(new Error('duplicate key value violates unique constraint'))).toBeNull()
    expect(omkCode(null)).toBeNull()
    expect(omkCode({})).toBeNull()
  })
})

describe('toUserMessage', () => {
  it('should translate every known business code', () => {
    for (const [code, message] of Object.entries(OMK_MESSAGES)) {
      expect(toUserMessage({ message: `omk:${code}` })).toBe(message)
    }
  })

  it('should never leak a raw Postgres message', () => {
    const raw = 'permission denied for table sessions'
    expect(toUserMessage(new Error(raw))).toBe(GENERIC_ERROR)
    expect(toUserMessage(new Error(raw))).not.toContain('sessions')
  })

  it('should use the provided fallback for unknown codes', () => {
    expect(toUserMessage({ message: 'omk:unknown_code' }, 'Oups')).toBe('Oups')
  })

  it('should keep AppError messages when passed through the fallback', () => {
    const error = new AppError('Sélectionne au moins un restaurant.')
    expect(toUserMessage(error, error.message)).toBe('Sélectionne au moins un restaurant.')
  })
})
