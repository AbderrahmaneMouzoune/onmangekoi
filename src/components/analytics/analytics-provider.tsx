'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

import { ConsentBanner } from '@/components/analytics/consent-banner'
import { useAnalyticsConsent } from '@/hooks/use-analytics-consent'
import {
  capturePageview,
  identifyProfile,
  startAnalytics,
  stopAnalytics,
} from '@/lib/analytics/client'

interface AnalyticsProviderProps {
  /** UUID du profil Supabase, ou `null` pour un visiteur sans pseudo. */
  profileId: string | null
}

/**
 * Point d'entrée unique de la mesure d'audience : décide du chargement selon
 * le consentement, rattache l'identifiant opaque, émet les vues de page et
 * affiche le bandeau. Ne rend rien d'autre que le bandeau.
 */
export function AnalyticsProvider({ profileId }: AnalyticsProviderProps) {
  const pathname = usePathname()
  const { choice, available } = useAnalyticsConsent()

  useEffect(() => {
    if (!available) return
    if (choice === 'granted') void startAnalytics()
    if (choice === 'denied') stopAnalytics()
  }, [available, choice])

  useEffect(() => {
    if (!available || choice !== 'granted') return
    identifyProfile(profileId)
  }, [available, choice, profileId])

  // Une vue par route (masquée par `before_send`), y compris en navigation client.
  useEffect(() => {
    if (!available || choice !== 'granted') return
    capturePageview()
  }, [available, choice, pathname])

  return <ConsentBanner />
}
