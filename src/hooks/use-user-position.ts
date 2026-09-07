'use client'

import { useCallback, useState } from 'react'

import type { GeoPoint } from '@/lib/maps'

export interface UserPosition {
  /** Position autorisée par la personne, `null` tant qu'elle ne l'a pas donnée. */
  position: GeoPoint | null
  isLocating: boolean
  /** Dernier refus ou échec, pour l'afficher à côté du bouton. */
  error: string | null
  /** Demande la position au navigateur ; ne fait rien si elle est déjà connue. */
  locate: () => void
  /** Oublie la position : les distances disparaissent et Google cherche sans biais. */
  clear: () => void
}

const OPTIONS: PositionOptions = { timeout: 8000, maximumAge: 5 * 60 * 1000 }

/**
 * Position de la personne, sur demande explicite seulement.
 *
 * Partagée par les deux onglets du sélecteur : elle sert à biaiser la
 * recherche Google **et** à afficher la distance de chaque resto, qu'il vienne
 * de Google ou de la base. Rien n'est demandé au chargement — le navigateur ne
 * pose la question qu'au clic sur « Autour de moi ».
 */
export function useUserPosition(): UserPosition {
  const [position, setPosition] = useState<GeoPoint | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setError('Ton navigateur ne sait pas donner ta position.')
      return
    }
    setError(null)
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({ lat: coords.latitude, lng: coords.longitude })
        setIsLocating(false)
      },
      () => {
        setError('Position refusée : les distances resteront inconnues.')
        setIsLocating(false)
      },
      OPTIONS
    )
  }, [])

  const clear = useCallback(() => {
    setPosition(null)
    setError(null)
  }, [])

  return { position, isLocating, error, locate, clear }
}
