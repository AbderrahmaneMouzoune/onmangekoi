'use client'

import { useCallback, useState } from 'react'

export interface Position {
  latitude: number
  longitude: number
}

/**
 * `idle` : on n'a encore rien demandé · `locating` : le navigateur cherche ·
 * `ready` : on a une position · `denied` : la personne a refusé ·
 * `unavailable` : le navigateur ne sait pas, ou n'a pas réussi.
 */
export type GeolocationStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable'

export interface Geolocation {
  position: Position | null
  status: GeolocationStatus
  /** Pourquoi la position manque, dans les mots de la personne qui lit. */
  error: string | null
  /** Demande la position. Une fois accordée, le navigateur ne redemande pas. */
  locate: () => void
  /** Oublie la position : les distances disparaissent, Google cherche sans biais. */
  clear: () => void
}

/** `GeolocationPositionError.PERMISSION_DENIED` — la constante n'existe pas sur tous les bouchons. */
const PERMISSION_DENIED = 1

/** Une position de moins de cinq minutes suffit : on ne guide pas une voiture. */
const OPTIONS: PositionOptions = { timeout: 8000, maximumAge: 5 * 60 * 1000 }

/**
 * Position de la personne, demandée explicitement et gardée le temps du
 * composant. Rien n'est stocké nulle part : la prochaine page redemandera,
 * et le navigateur répondra sans question s'il a déjà l'autorisation.
 */
export function useGeolocation(): Geolocation {
  const [position, setPosition] = useState<Position | null>(null)
  const [status, setStatus] = useState<GeolocationStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatus('unavailable')
      setError('Ton navigateur ne sait pas donner ta position.')
      return
    }
    setStatus('locating')
    setError(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({ latitude: coords.latitude, longitude: coords.longitude })
        setStatus('ready')
      },
      (failure) => {
        const denied = failure.code === PERMISSION_DENIED
        setStatus(denied ? 'denied' : 'unavailable')
        setError(
          denied
            ? 'Position refusée : pas de restos autour de toi, mais la recherche par nom marche.'
            : 'Impossible de te situer pour l’instant.'
        )
      },
      OPTIONS
    )
  }, [])

  const clear = useCallback(() => {
    setPosition(null)
    setStatus('idle')
    setError(null)
  }, [])

  return { position, status, error, locate, clear }
}
