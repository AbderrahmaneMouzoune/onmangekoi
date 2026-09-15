'use client'

import { RiMapPin2Line } from '@remixicon/react'
import { useEffect, useState, useTransition } from 'react'

import { importPlaceAction } from '@/actions/places'
import { ResultRow } from '@/components/restaurants/result-row'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { GENERIC_ERROR } from '@/domain/errors'
import { PLACES_QUERY_MIN } from '@/domain/schemas/place'
import { PRICE_LEVEL_LABELS } from '@/domain/schemas/restaurant'
import { distanceMeters, formatDistance } from '@/lib/maps'

import type { Restaurant } from '@/data-access/models'
import type { PlaceResult } from '@/domain/places'
import type { Geolocation } from '@/hooks/use-geolocation'

interface GooglePlacesResultsProps {
  /** Recherche déjà débouncée, partagée avec l'onglet « La base ». */
  query: string
  /** Position de la personne, tenue par le sélecteur pour survivre aux changements d'onglet. */
  geolocation: Geolocation
  /** Resto déjà en base pour ce lieu Google — importé à l'instant, ou connu du catalogue. */
  restaurantForPlace: (placeId: string) => Restaurant | undefined
  isSelected: (restaurantId: string) => boolean
  isLocked: (restaurantId: string) => boolean
  /** Coche ou décoche un resto déjà en base : aucun appel à Google. */
  onToggle: (restaurant: Restaurant) => void
  /** Un lieu qu'on ne connaissait pas vient d'être importé, et sélectionné. */
  onImported: (restaurant: Restaurant) => void
}

type Mode = 'search' | 'nearby' | 'none'

/**
 * Onglet « Google » du sélecteur de restaurants.
 *
 * Il s'ouvre sur les restos les plus proches — la position est demandée en
 * cliquant l'onglet, et tant qu'on ne tape rien, c'est ça qu'on voit. Taper
 * un nom lance une recherche, biaisée par la même position. Un lieu qu'on
 * coche est importé en base (le serveur ne reçoit qu'un `place_id` et relit
 * la fiche chez Google lui-même) puis reste coché comme n'importe quel resto
 * de la base : le décocher ne coûte rien.
 */
export function GooglePlacesResults({
  query,
  geolocation,
  restaurantForPlace,
  isSelected,
  isLocked,
  onToggle,
  onImported,
}: GooglePlacesResultsProps) {
  /**
   * Résultats gardés avec la requête qui les a produits. Tant que la clé ne
   * correspond pas, c'est qu'une recherche est en cours : pas besoin d'un
   * `isSearching` à tenir à jour en parallèle.
   */
  const [found, setFound] = useState<{ key: string; places: PlaceResult[] }>({
    key: '',
    places: [],
  })
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [isImporting, startImport] = useTransition()

  const { position, status, locate } = geolocation
  const trimmed = query.trim()
  const mode: Mode = trimmed.length >= PLACES_QUERY_MIN ? 'search' : position ? 'nearby' : 'none'
  const here = position ? `${position.latitude}|${position.longitude}` : ''
  const requestKey =
    mode === 'search' ? `q|${trimmed}|${here}` : mode === 'nearby' ? `near|${here}` : ''
  const isSearching = mode !== 'none' && found.key !== requestKey

  useEffect(() => {
    if (mode === 'none') return

    let cancelled = false
    const controller = new AbortController()

    fetch('/api/places/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: mode === 'search' ? trimmed : '',
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (cancelled) return
        setError(response.ok ? null : (payload?.error ?? GENERIC_ERROR))
        setFound({ key: requestKey, places: response.ok ? (payload?.results ?? []) : [] })
      })
      .catch(() => {
        if (cancelled) return
        setError('La recherche Google a échoué. Réessaie.')
        setFound({ key: requestKey, places: [] })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [mode, requestKey, trimmed, position])

  function importPlace(place: PlaceResult) {
    setError(null)
    setImporting(place.placeId)
    startImport(async () => {
      const result = await importPlaceAction(place.placeId)
      setImporting(null)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onImported(result.data)
    })
  }

  function toggle(place: PlaceResult) {
    const known = restaurantForPlace(place.placeId)
    if (known) onToggle(known)
    else importPlace(place)
  }

  const places = found.key === requestKey ? found.places : []
  const canLocate = status !== 'locating' && status !== 'ready'

  const caption =
    mode === 'nearby'
      ? 'Les plus proches de toi'
      : mode === 'search'
        ? position
          ? 'Résultats Google, autour de toi'
          : 'Résultats Google'
        : status === 'locating'
          ? 'On regarde ce qu’il y a autour de toi…'
          : 'Résultats Google'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{caption}</p>
        {canLocate && (
          <Button type="button" variant="ghost" size="sm" onClick={locate}>
            <RiMapPin2Line aria-hidden="true" />
            Autour de moi
          </Button>
        )}
      </div>

      <FormMessage error={error} />

      <ul
        className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg bg-surface p-1.5 ring-1 ring-line"
        aria-label="Résultats Google"
        aria-busy={isSearching || status === 'locating' || undefined}
      >
        {mode === 'none' && status === 'locating' && (
          <li className="flex flex-col items-center gap-2 px-3 py-6 text-center text-sm text-muted-foreground">
            <Spinner />
            On cherche les restos autour de toi…
          </li>
        )}
        {mode === 'none' && status !== 'locating' && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            {geolocation.error ??
              'Autorise ta position pour voir les restos autour de toi, ou cherche un nom.'}
          </li>
        )}
        {isSearching && (
          <li className="flex justify-center px-3 py-6">
            <Spinner />
          </li>
        )}
        {mode === 'search' && !isSearching && places.length === 0 && !error && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            Google ne trouve rien pour « {trimmed} ».
          </li>
        )}
        {mode === 'nearby' && !isSearching && places.length === 0 && !error && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            Rien à moins de deux kilomètres. Cherche un resto par son nom.
          </li>
        )}
        {places.map((place) => {
          const known = restaurantForPlace(place.placeId)
          const locked = known ? isLocked(known.id) : false
          const checked = known ? locked || isSelected(known.id) : false
          const distance =
            position && place.location
              ? formatDistance(
                  distanceMeters(
                    { lat: position.latitude, lng: position.longitude },
                    place.location
                  )
                )
              : ''
          return (
            <li key={place.placeId}>
              <ResultRow
                name={place.name}
                subtitle={place.address}
                meta={
                  <>
                    {distance && <span className="font-medium text-ink-2">{distance}</span>}
                    {place.cuisineType && (
                      <span className="font-mono tracking-wide uppercase">{place.cuisineType}</span>
                    )}
                    {place.priceLevel && <span>{PRICE_LEVEL_LABELS[place.priceLevel]}</span>}
                  </>
                }
                checked={checked}
                locked={locked}
                busy={isImporting && importing === place.placeId}
                disabled={isImporting && importing !== place.placeId}
                onToggle={() => toggle(place)}
              />
            </li>
          )
        })}
      </ul>

      {places.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Cocher un resto importe sa fiche — photo, adresse, horaires — et l’ajoute à la sélection.
          Un lieu déjà importé rejoint la sélection sans créer de doublon.
        </p>
      )}
    </div>
  )
}
