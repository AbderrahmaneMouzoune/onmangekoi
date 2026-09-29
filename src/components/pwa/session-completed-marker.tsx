'use client'

import { useEffect } from 'react'

import { markSessionCompleted } from '@/lib/pwa/install-offer'

/**
 * Posé sur le classement final d'un participant : retient, dans ce
 * navigateur, qu'une session a abouti — la condition pour proposer
 * d'installer l'app (voir `InstallBanner`). Ne rend rien.
 */
export function SessionCompletedMarker() {
  useEffect(() => {
    markSessionCompleted()
  }, [])

  return null
}
