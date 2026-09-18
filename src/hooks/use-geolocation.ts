'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useIsClient } from '@/hooks/use-is-client'

import type { GeoPoint } from '@/lib/maps'

/**
 * `unsupported` : pas de géolocalisation dans ce navigateur.
 * `idle` : possible, jamais demandée (ou tentative sans suite : réessayable).
 * `pending` : demande en cours — le navigateur affiche sa propre invite.
 * `granted` : position connue.
 * `denied` : refus explicite ; on ne redemande pas.
 */
export type GeolocationStatus = 'unsupported' | 'idle' | 'pending' | 'granted' | 'denied'

export interface GeolocationState {
  status: GeolocationStatus
  position: GeoPoint | null
  /** Déclenche la demande. Sans effet si elle est déjà en cours ou refusée. */
  request: () => void
}

/** 5 minutes : à l'échelle du quartier, personne n'a bougé entre deux filtres. */
const OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 5 * 60 * 1000,
}

function geolocation(): Geolocation | null {
  return typeof navigator === 'undefined' ? null : (navigator.geolocation ?? null)
}

/**
 * Position du navigateur, demandée seulement quand la personne le demande.
 *
 * Rien n'est stocké ni envoyé ailleurs que dans la requête de recherche : la
 * position ne sert qu'à trier et filtrer le catalogue.
 *
 * `useIsClient` tient l'hydratation : le serveur ne sait pas si le navigateur
 * saura géolocaliser, donc le premier rendu dit « non » des deux côtés et la
 * réponse arrive ensuite — plutôt qu'un écart entre le HTML et l'hydratation.
 */
export function useGeolocation(): GeolocationState {
  const [state, setState] = useState<Exclude<GeolocationStatus, 'unsupported'>>('idle')
  const [position, setPosition] = useState<GeoPoint | null>(null)
  const isClient = useIsClient()
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const request = useCallback(() => {
    const api = geolocation()
    if (!api) return
    setState('pending')
    api.getCurrentPosition(
      (result) => {
        if (!mounted.current) return
        setPosition({ lat: result.coords.latitude, lng: result.coords.longitude })
        setState('granted')
      },
      (error) => {
        if (!mounted.current) return
        // Un refus est définitif tant que la personne n'a pas changé d'avis
        // dans son navigateur : le filtre disparaît. Une panne passagère
        // (position indisponible, délai dépassé) laisse le bouton réessayable.
        setState(error.code === error.PERMISSION_DENIED ? 'denied' : 'idle')
      },
      OPTIONS
    )
  }, [])

  useEffect(() => {
    if (!geolocation()) return
    // Permission déjà accordée : on reprend la position sans invite. Déjà
    // refusée : inutile de proposer un bouton qui ne mènera nulle part.
    // L'API Permissions n'existe pas partout — son absence n'est pas un refus.
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((permission) => {
        if (!mounted.current) return
        if (permission.state === 'granted') request()
        if (permission.state === 'denied') setState('denied')
      })
      .catch(() => {})
  }, [request])

  return {
    status: isClient && geolocation() ? state : 'unsupported',
    position,
    request,
  }
}
