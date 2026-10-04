import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import { AppError, omkError } from '@/domain/errors'

import { LOCALES, type Locale } from './config'
import { describeError } from './errors'
import { MESSAGES } from './messages'

function errorsTranslator(locale: Locale) {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace: 'errors' })
}

describe('describeError', () => {
  it.each(LOCALES)('should translate every known business code in %s', (locale) => {
    const t = errorsTranslator(locale)
    for (const code of Object.keys(MESSAGES.fr.errors.codes)) {
      const message = describeError(t, { message: `omk:${code}` })
      expect(message).not.toBe(t('generic'))
      expect(message).not.toContain('omk:')
    }
  })

  it('should never leak a raw Postgres message', () => {
    const t = errorsTranslator('fr')
    const raw = 'permission denied for table sessions'
    expect(describeError(t, new Error(raw))).toBe(MESSAGES.fr.errors.generic)
  })

  it('should use the action fallback for an unknown code', () => {
    const t = errorsTranslator('en')
    expect(describeError(t, omkError('unknown_code'), 'profileSave')).toBe(
      MESSAGES.en.errors.fallback.profileSave
    )
    expect(describeError(t, omkError('unknown_code'))).toBe(MESSAGES.en.errors.generic)
  })

  it('should fill the values an application error carries', () => {
    const error = new AppError('all_recent_winners', { days: 7 })
    expect(describeError(errorsTranslator('fr'), error)).toContain('les 7 derniers jours')
    expect(describeError(errorsTranslator('en'), error)).toContain('the last 7 days')
  })

  it('should translate the same code differently per language', () => {
    const error = omkError('session_closed')
    expect(describeError(errorsTranslator('fr'), error)).toBe('Cette session est terminée.')
    expect(describeError(errorsTranslator('en'), error)).toBe('This session is over.')
  })
})
