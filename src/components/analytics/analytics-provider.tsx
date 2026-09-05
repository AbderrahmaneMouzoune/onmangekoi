'use client'

import { useEffect } from 'react'

import { ConsentBanner } from '@/components/analytics/consent-banner'
import { useAnalyticsConsent } from '@/hooks/use-analytics-consent'
import { identifyProfile, startAnalytics, stopAnalytics } from '@/lib/analytics/client'

/**
 * Point d'entrée de la mesure d'audience : décide du chargement selon le
 * consentement et affiche le bandeau. Ne lit ni l'URL ni l'utilisateur, pour
 * rester dans la coquille prérendue de chaque route — les vues de page sont
 * comptées par PostHog lui-même (`capture_pageview: 'history_change'`), et
 * l'identification arrive par `AnalyticsIdentity` sous `<Suspense>`.
 */
export function AnalyticsProvider() {
  const { choice, available } = useAnalyticsConsent()

  useEffect(() => {
    if (!available) return
    if (choice === 'granted') void startAnalytics()
    if (choice === 'denied') stopAnalytics()
  }, [available, choice])

  return <ConsentBanner />
}

/**
 * Rattache la mesure à l'UUID opaque du profil. Ne rend rien : c'est le seul
 * fragment de la mesure qui dépend de l'utilisateur, isolé pour que le reste
 * reste prérendu.
 */
export function IdentifyProfile({ profileId }: { profileId: string | null }) {
  useEffect(() => {
    identifyProfile(profileId)
  }, [profileId])

  return null
}
