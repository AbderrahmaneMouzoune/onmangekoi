'use client'

import { RiAddLine, RiMapPin2Line } from '@remixicon/react'
import { useEffect, useState, useTransition } from 'react'

import { importPlaceAction } from '@/actions/places'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { GENERIC_ERROR } from '@/domain/errors'
import { PLACES_QUERY_MIN } from '@/domain/schemas/place'
import { PRICE_LEVEL_LABELS } from '@/domain/schemas/restaurant'

import type { Restaurant } from '@/data-access/models'
import type { PlaceResult } from '@/domain/places'

interface GooglePlacesResultsProps {
  /** Recherche déjà débouncée, partagée avec l'onglet « Base ». */
  query: string
  onImported: (restaurant: Restaurant) => void
}

interface Position {
  latitude: number
  longitude: number
}

/**
 * Onglet « Google » du sélecteur de restaurants.
 *
 * La recherche passe par `POST /api/places/search` : la clé Places ne quitte
 * jamais le serveur. Un clic sur un résultat l'importe en base — le serveur
 * ne reçoit qu'un `place_id` et relit les champs chez Google lui-même, donc
 * rien de ce qui est enregistré ne vient du navigateur.
 */
export function GooglePlacesResults({ query, onImported }: GooglePlacesResultsProps) {
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
  const [position, setPosition] = useState<Position | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [isImporting, startImport] = useTransition()

  const trimmed = query.trim()
  const canSearch = trimmed.length >= PLACES_QUERY_MIN
  const searchKey = `${trimmed}|${position?.latitude ?? ''}|${position?.longitude ?? ''}`
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
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
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

  function locate() {
    if (!('geolocation' in navigator)) {
      setError('Ton navigateur ne sait pas donner ta position.')
      return
    }
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({ latitude: coords.latitude, longitude: coords.longitude })
        setIsLocating(false)
      },
      () => {
        setError('Position refusée : la recherche reste sans biais géographique.')
        setIsLocating(false)
      },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
  }

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
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {position ? 'Résultats autour de toi' : 'Résultats Google'}
        </p>
        {!position && (
          <Button type="button" variant="ghost" size="sm" onClick={locate} disabled={isLocating}>
            {isLocating ? <Spinner /> : <RiMapPin2Line aria-hidden="true" />}
            Autour de moi
          </Button>
        )}
      </div>

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
