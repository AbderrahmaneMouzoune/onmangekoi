import { describe, expect, it } from 'vitest'

import { AppError, omkCode, omkError } from './errors'

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

describe('omkError', () => {
  it('should build an error the rest of the app reads like a database one', () => {
    expect(omkCode(omkError('too_many_attempts'))).toBe('too_many_attempts')
  })
})

describe('AppError', () => {
  it('should follow the database contract, with the values of its message', () => {
    const error = new AppError('all_recent_winners', { days: 7 })
    expect(omkCode(error)).toBe('all_recent_winners')
    expect(error.code).toBe('all_recent_winners')
    expect(error.values).toEqual({ days: 7 })
    expect(error).toBeInstanceOf(Error)
  })
})
