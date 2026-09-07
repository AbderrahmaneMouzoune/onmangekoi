'use client'

import { RiAddLine } from '@remixicon/react'
import { useEffect, useMemo, useState, useTransition } from 'react'

import { importPlaceAction } from '@/actions/places'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { GENERIC_ERROR } from '@/domain/errors'
import { PLACES_QUERY_MIN } from '@/domain/schemas/place'
import { PRICE_LEVEL_LABELS } from '@/domain/schemas/restaurant'
import { roundGeoPoint } from '@/lib/maps'

import type { Restaurant } from '@/data-access/models'
import type { PlaceResult } from '@/domain/places'
import type { GeoPoint } from '@/lib/maps'

interface GooglePlacesResultsProps {
  /** Recherche déjà débouncée, partagée avec l'onglet « Base ». */
  query: string
  /**
   * Position autorisée dans le sélecteur, `null` sinon. Elle biaise la
   * recherche de 5 km autour du point — le bouton « Autour de moi » vit dans
   * le sélecteur, pour ne demander la permission qu'une fois pour les deux
   * onglets.
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

  /** Le point envoyé à Google est arrondi : un biais de 5 km n'en demande pas plus. */
  const bias = useMemo(() => (position ? roundGeoPoint(position) : null), [position])

  const trimmed = query.trim()
  const canSearch = trimmed.length >= PLACES_QUERY_MIN
  const searchKey = `${trimmed}|${bias?.lat ?? ''}|${bias?.lng ?? ''}`
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
        latitude: bias?.lat ?? null,
        longitude: bias?.lng ?? null,
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
  }, [searchKey, trimmed, canSearch, bias])

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
        {position ? 'Résultats Google, autour de toi' : 'Résultats Google'}
      </p>

      <FormMessage error={error} />

      <ul
        className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg bg-surface p-1.5 ring-1 ring-line"
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
        {places.map((place) => {
          const isBusy = isImporting && importing === place.placeId
          return (
            <li key={place.placeId}>
              <button
                type="button"
                onClick={() => importPlace(place)}
                disabled={isImporting}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
              >
                <span
                  aria-hidden="true"
                  className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong"
                >
                  {isBusy ? <Spinner className="size-3" /> : <RiAddLine className="size-3.5" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{place.name}</span>
                  {place.address && (
                    <span className="truncate text-xs text-muted-foreground">{place.address}</span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  {place.cuisineType && (
                    <span className="font-mono text-[0.68rem] tracking-wide text-muted-foreground uppercase">
                      {place.cuisineType}
                    </span>
                  )}
                  {place.priceLevel && (
                    <span className="text-[0.68rem] text-muted-foreground">
                      {PRICE_LEVEL_LABELS[place.priceLevel]}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
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
