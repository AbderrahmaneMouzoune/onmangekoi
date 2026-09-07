'use client'

import { useEffect, useState, useTransition } from 'react'

import { importPlaceAction } from '@/actions/places'
import { RestaurantPickCard } from '@/components/restaurants/restaurant-pick-card'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { GENERIC_ERROR } from '@/domain/errors'
import { PLACES_QUERY_MIN } from '@/domain/schemas/place'
import { distanceLabel } from '@/lib/maps'

import type { Restaurant } from '@/data-access/models'
import type { PlaceResult } from '@/domain/places'
import type { GeoPoint } from '@/lib/maps'

interface GooglePlacesResultsProps {
  /** Recherche déjà débouncée, partagée avec l'onglet « Base ». */
  query: string
  /**
   * Position de la personne, si elle l'a donnée (bouton « Autour de moi » du
   * sélecteur) : biaise la recherche et affiche la distance de chaque lieu.
   */
  position: GeoPoint | null
  onImported: (restaurant: Restaurant) => void
}

/**
 * Onglet « Google » du sélecteur de restaurants.
 *
 * La recherche passe par `POST /api/places/search` : la clé Places ne quitte
 * jamais le serveur. Un clic sur un résultat l'importe en base — le serveur
 * ne reçoit qu'un `place_id` et relit les champs chez Google lui-même, donc
 * rien de ce qui est enregistré ne vient du navigateur.
 */
export function GooglePlacesResults({ query, position, onImported }: GooglePlacesResultsProps) {
  /**
   * Résultats gardés avec la recherche qui les a produits. Tant que la clé ne
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

  const trimmed = query.trim()
  const canSearch = trimmed.length >= PLACES_QUERY_MIN
  const searchKey = `${trimmed}|${position?.lat ?? ''}|${position?.lng ?? ''}`
  const isSearching = canSearch && found.key !== searchKey

  useEffect(() => {
    if (!canSearch) return

    let cancelled = false
    const controller = new AbortController()

    fetch('/api/places/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: trimmed,
        latitude: position?.lat ?? null,
        longitude: position?.lng ?? null,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (cancelled) return
        setError(response.ok ? null : (payload?.error ?? GENERIC_ERROR))
        setFound({ key: searchKey, places: response.ok ? (payload?.results ?? []) : [] })
      })
      .catch(() => {
        if (cancelled) return
        setError('La recherche Google a échoué. Réessaie.')
        setFound({ key: searchKey, places: [] })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [searchKey, trimmed, canSearch, position])

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

  const places = found.key === searchKey ? found.places : []

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {position ? 'Résultats Google autour de toi' : 'Résultats Google'}
      </p>

      <FormMessage error={error} />

      <ul
        className="flex max-h-[26rem] flex-col gap-1 overflow-y-auto overscroll-contain rounded-lg bg-surface p-1.5 ring-1 ring-line"
        aria-label="Résultats Google"
        aria-busy={isSearching}
      >
        {!canSearch && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            Tape le nom d’un resto pour le chercher chez Google.
          </li>
        )}
        {isSearching && (
          <li className="flex justify-center px-3 py-6">
            <Spinner />
          </li>
        )}
        {canSearch && !isSearching && places.length === 0 && !error && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            Google ne trouve rien pour « {trimmed} ».
          </li>
        )}
        {places.map((place) => (
          <li key={place.placeId}>
            <RestaurantPickCard
              control="add"
              name={place.name}
              cuisineType={place.cuisineType}
              priceLevel={place.priceLevel}
              detail={place.address}
              distance={distanceLabel(position, place.location)}
              openingHours={place.openingHours}
              rating={
                place.rating !== null ? { value: place.rating, count: place.ratingCount } : null
              }
              busy={isImporting && importing === place.placeId}
              disabled={isImporting}
              onClick={() => importPlace(place)}
            />
          </li>
        ))}
      </ul>

      {places.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Un clic importe le resto et le sélectionne. Un lieu déjà importé rejoint la sélection sans
          créer de doublon.
        </p>
      )}
    </div>
  )
}
