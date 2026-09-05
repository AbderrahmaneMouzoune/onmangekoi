'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { isAnalyticsConfigured } from '@/lib/analytics/client'
import { getConsent, setConsent, subscribeConsent } from '@/lib/analytics/consent'

import type { ConsentChoice } from '@/lib/analytics/consent'

export interface AnalyticsConsent {
  /** Choix courant. `unset` tant que la personne n'a pas répondu. */
  choice: ConsentChoice
  /** La mesure est configurée sur ce déploiement (clé PostHog présente). */
  available: boolean
  accept: () => void
  refuse: () => void
}

const serverSnapshot = (): ConsentChoice => 'unset'

/**
 * État du consentement, partagé entre le bandeau et le réglage du compte.
 * L'effet de bord (charger ou couper PostHog) est centralisé dans
 * `AnalyticsProvider` : ce hook ne fait que lire et écrire le choix.
 */
export function useAnalyticsConsent(): AnalyticsConsent {
  const choice = useSyncExternalStore(subscribeConsent, getConsent, serverSnapshot)

  const accept = useCallback(() => setConsent('granted'), [])
  const refuse = useCallback(() => setConsent('denied'), [])

  return { choice, available: isAnalyticsConfigured(), accept, refuse }
}
