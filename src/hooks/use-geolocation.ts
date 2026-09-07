'use client'

import { useCallback, useState } from 'react'

import type { GeoPoint } from '@/lib/maps'

/**
 * `idle` tant que rien n'a été demandé — c'est l'état par défaut, et le seul
 * qui rende côté serveur : on ne réclame jamais la position sans un geste
 * explicite.
 */
export type GeolocationStatus = 'idle' | 'locating' | 'located' | 'refused'

export interface Geolocation {
  /** Position exacte du navigateur. Ne sort pas d'ici sans être arrondie. */
  position: GeoPoint | null
  status: GeolocationStatus
  /** Message prêt à afficher, `null` tant que rien n'a échoué. */
  error: string | null
  request: () => void
  /** Retour à l'état initial — la position est oubliée. */
  clear: () => void
}

const REFUSED = 'Position refusée : autorise la géolocalisation pour voir les restos autour de toi.'
const UNSUPPORTED = 'Ton navigateur ne sait pas donner ta position.'
const UNAVAILABLE = 'Position introuvable pour l’instant. Réessaie dans un instant.'
const TIMED_OUT = 'La position met trop de temps à arriver. Réessaie.'

function messageFor(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return REFUSED
  return error.code === error.TIMEOUT ? TIMED_OUT : UNAVAILABLE
}

/**
 * Position du navigateur, à la demande.
 *
 * Rien n'est déclenché au montage : `getCurrentPosition` fait apparaître la
 * demande de permission du navigateur, elle doit répondre à un clic. La
 * position n'est pas non plus suivie (`watchPosition`) — pour classer des
 * restos par distance, savoir où l'on était il y a cinq minutes suffit.
 */
export function useGeolocation(): Geolocation {
  const [position, setPosition] = useState<GeoPoint | null>(null)
  const [status, setStatus] = useState<GeolocationStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatus('refused')
      setError(UNSUPPORTED)
      return
    }

    setStatus('locating')
    setError(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({ lat: coords.latitude, lng: coords.longitude })
        setStatus('located')
        setError(null)
      },
      (positionError) => {
        setStatus('refused')
        setError(messageFor(positionError))
      },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
  }, [])

  const clear = useCallback(() => {
    setPosition(null)
    setStatus('idle')
    setError(null)
  }, [])

  return { position, status, error, request, clear }
}
