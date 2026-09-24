'use client'

import { RiMapPin2Line, RiStarFill } from '@remixicon/react'
import { useEffect, useState } from 'react'

import { Facts } from '@/components/restaurants/catalog-results'
import { RecentWinnerBadge } from '@/components/restaurants/recent-winner-badge'
import { ResultRow } from '@/components/restaurants/result-row'
import { SeedNeighbourhood } from '@/components/restaurants/seed-neighbourhood'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { GENERIC_ERROR } from '@/domain/errors'
import { NO_RECENT_WINNERS } from '@/domain/recent-winners'
import { PLACES_QUERY_MIN } from '@/domain/schemas/place'
import { distanceLabel, geoPoint } from '@/lib/maps'

import type { Restaurant } from '@/data-access/models'
import type { PlaceResult, PlacesPage } from '@/domain/places'
import type { RecentWinnerDates } from '@/domain/recent-winners'
import type { Geolocation } from '@/hooks/use-geolocation'

interface GooglePlacesResultsProps {
  /** Recherche déjà débouncée, partagée avec l'onglet « Le carnet ». */
  query: string
  /** Position de la personne, tenue par le sélecteur pour survivre aux changements d'onglet. */
  geolocation: Geolocation
  /**
   * Pages déjà reçues, par demande. Tenues par le sélecteur elles aussi :
   * quitter l'onglet et y revenir retrouve les résultats sans rien recharger.
   */
  cache: ReadonlyMap<string, PlacesPage>
  onCached: (key: string, page: PlacesPage) => void
  /** Resto déjà en base pour ce lieu Google — importé à l'instant, ou connu du carnet. */
  restaurantForPlace: (placeId: string) => Restaurant | undefined
  isSelected: (restaurantId: string) => boolean
  isLocked: (restaurantId: string) => boolean
  /** Lieux dont l'import est en cours : cochés d'avance, le temps que la fiche arrive. */
  pendingPlaceIds: ReadonlySet<string>
  /** Coche ou décoche un resto déjà en base : aucun appel à Google. */
  onToggle: (restaurant: Restaurant) => void
  /** Importe un lieu qu'on ne connaissait pas — et le sélectionne sans attendre. */
  onImport: (place: PlaceResult) => void
  /** Échec du dernier import, affiché ici, là où le geste a eu lieu. */
  importError: string | null
  /**
   * Restos entrés en base par un amorçage de quartier : le carnet les adopte
   * sans recharger, et les lignes d'ici cessent d'être des lieux inconnus.
   */
  onSeeded: (restaurants: Restaurant[]) => void
  /** Anti-fatigue : date du dernier sacre, pour un lieu déjà connu du carnet */
  recentWinners?: RecentWinnerDates
  /** Anti-fatigue actif : un gagnant récent est écarté, donc ni coché ni cochable */
  excludeRecent?: boolean
}

type Mode = 'search' | 'nearby' | 'none'

interface SearchRequest {
  query: string
  latitude: number | null
  longitude: number | null
  pageToken?: string
}

const NETWORK_FAILURE = 'La recherche Google a échoué. Réessaie.'

const ratingFormatter = new Intl.NumberFormat('fr', { maximumFractionDigits: 1 })

/** Note Google sur 5 et nombre d'avis : de quoi choisir, jamais enregistré. */
function Rating({ value, count }: { value: number; count: number | null }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-fav">
      <RiStarFill aria-hidden="true" className="size-3" />
      {ratingFormatter.format(value)}
      {count !== null && (
        <span className="text-muted-foreground">({ratingFormatter.format(count)})</span>
      )}
      <span className="sr-only"> sur 5</span>
    </span>
  )
}

async function fetchPlaces(request: SearchRequest, signal?: AbortSignal): Promise<PlacesPage> {
  let response: Response
  try {
    response = await fetch('/api/places/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error(NETWORK_FAILURE)
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error ?? GENERIC_ERROR)
  return { places: payload?.results ?? [], nextPageToken: payload?.nextPageToken ?? null }
}

/** La page suivante s'ajoute à la précédente, sans jamais répéter un lieu. */
function appendPage(current: PlacesPage, next: PlacesPage): PlacesPage {
  const seen = new Set(current.places.map((place) => place.placeId))
  return {
    places: [...current.places, ...next.places.filter((place) => !seen.has(place.placeId))],
    nextPageToken: next.nextPageToken,
  }
}

/**
 * Onglet « Google » du sélecteur de restaurants.
 *
 * Il s'ouvre sur les restos les plus proches — la position est demandée en
 * cliquant l'onglet, et tant qu'on ne tape rien, c'est ça qu'on voit. Taper
 * un nom lance une recherche, biaisée par la même position. « Voir plus »
 * demande la page suivante de la même liste.
 *
 * Cocher un lieu inconnu l'importe en base (le serveur ne reçoit qu'un
 * `place_id` et relit la fiche chez Google lui-même) : la ligne se coche
 * tout de suite, l'import suit. Un lieu déjà en base se coche et se décoche
 * comme n'importe quel resto du carnet, sans rien demander à Google.
 */
export function GooglePlacesResults({
  query,
  geolocation,
  cache,
  onCached,
  restaurantForPlace,
  isSelected,
  isLocked,
  pendingPlaceIds,
  onToggle,
  onImport,
  importError,
  onSeeded,
  recentWinners = NO_RECENT_WINNERS,
  excludeRecent = false,
}: GooglePlacesResultsProps) {
  const { position, status, locate } = geolocation
  const trimmed = query.trim()
  const mode: Mode = trimmed.length >= PLACES_QUERY_MIN ? 'search' : position ? 'nearby' : 'none'
  const here = geoPoint(position)
  const at = position ? `${position.latitude}|${position.longitude}` : ''
  const requestKey =
    mode === 'search' ? `q|${trimmed}|${at}` : mode === 'nearby' ? `near|${at}` : ''

  const page = mode === 'none' ? undefined : cache.get(requestKey)
  /** Dernier échec, avec la demande qui l'a produit : rien de périmé à l'écran. */
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [isLoadingMore, setLoadingMore] = useState(false)

  const fetchError = failure?.key === requestKey ? failure.message : null
  const isSearching = mode !== 'none' && !page && !fetchError

  useEffect(() => {
    if (mode === 'none' || cache.has(requestKey) || failure?.key === requestKey) return

    let cancelled = false
    const controller = new AbortController()

    fetchPlaces(
      {
        query: mode === 'search' ? trimmed : '',
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
      },
      controller.signal
    )
      .then((result) => {
        if (!cancelled) onCached(requestKey, result)
      })
      .catch((error: Error) => {
        if (!cancelled) setFailure({ key: requestKey, message: error.message || NETWORK_FAILURE })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [mode, requestKey, cache, failure, onCached, trimmed, position])

  function loadMore() {
    const token = page?.nextPageToken
    if (!page || !token || isLoadingMore) return
    setLoadingMore(true)
    fetchPlaces({
      query: mode === 'search' ? trimmed : '',
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
      pageToken: token,
    })
      .then((next) => onCached(requestKey, appendPage(page, next)))
      .catch((error: Error) =>
        setFailure({ key: requestKey, message: error.message || NETWORK_FAILURE })
      )
      .finally(() => setLoadingMore(false))
  }

  function toggle(place: PlaceResult) {
    if (pendingPlaceIds.has(place.placeId)) return
    const known = restaurantForPlace(place.placeId)
    if (known) onToggle(known)
    else onImport(place)
  }

  const places = page?.places ?? []
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

      {/* Amorcer demande une position, jamais l'inverse : sans autorisation
          déjà accordée, l'action n'existe pas. */}
      {position && <SeedNeighbourhood position={position} onSeeded={onSeeded} />}

      <FormMessage error={fetchError ?? importError} />

      <ul
        className="flex max-h-[26rem] flex-col gap-1 overflow-y-auto overscroll-contain rounded-lg bg-surface p-1.5 ring-1 ring-line"
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
        {fetchError && !page && (
          <li className="flex justify-center p-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setFailure(null)}>
              Réessayer
            </Button>
          </li>
        )}
        {mode === 'search' && page && places.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            Google ne trouve rien pour « {trimmed} ».
          </li>
        )}
        {mode === 'nearby' && page && places.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            Rien à moins de deux kilomètres. Cherche un resto par son nom.
          </li>
        )}
        {places.map((place) => {
          const known = restaurantForPlace(place.placeId)
          const pending = pendingPlaceIds.has(place.placeId)
          // Un lieu que le carnet connaît déjà peut avoir gagné récemment :
          // l'onglet Google le dit comme le carnet, sinon cocher la case
          // écarterait une carte qui a l'air disponible.
          const wonAt = known ? recentWinners[known.id] : undefined
          const excluded = excludeRecent && wonAt !== undefined
          const locked = known ? excluded || isLocked(known.id) : false
          const checked = known ? !excluded && (locked || isSelected(known.id)) : pending
          const distance = distanceLabel(here, place.location)
          return (
            <li key={place.placeId}>
              <ResultRow
                name={place.name}
                photoUrl={known?.photo_url}
                facts={
                  <Facts cuisine={place.cuisineType} price={place.priceLevel}>
                    {place.rating !== null && (
                      <Rating value={place.rating} count={place.ratingCount} />
                    )}
                  </Facts>
                }
                subtitle={place.address}
                openingHours={place.openingHours}
                meta={
                  wonAt || distance ? (
                    <>
                      {wonAt && <RecentWinnerBadge wonAt={wonAt} excluded={excluded} />}
                      {distance && <span className="font-medium text-ink-2">{distance}</span>}
                    </>
                  ) : undefined
                }
                checked={checked}
                locked={locked}
                busy={pending}
                onToggle={() => toggle(place)}
              />
            </li>
          )
        })}
        {page?.nextPageToken && (
          <li className="p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={loadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? <Spinner /> : 'Voir plus'}
            </Button>
          </li>
        )}
      </ul>

      {places.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Cocher un resto l’ajoute à la sélection et importe sa fiche — photo, adresse, horaires. Un
          lieu déjà importé rejoint la sélection sans créer de doublon.
        </p>
      )}
    </div>
  )
}
