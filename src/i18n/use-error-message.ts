'use client'

import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

import { describeError, type ErrorFallback } from './errors'

/**
 * Pendant client de `translateError` : pour une erreur attrapée dans le
 * navigateur (réponse d'une route d'API, échec réseau).
 */
export function useErrorMessage(): (error: unknown, fallback?: ErrorFallback) => string {
  const t = useTranslations('errors')
  return useCallback((error, fallback) => describeError(t, error, fallback), [t])
}
