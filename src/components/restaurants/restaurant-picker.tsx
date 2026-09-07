'use client'

import { RiAddLine, RiCheckLine, RiCloseLine, RiMapPin2Line, RiSearchLine } from '@remixicon/react'
import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'

import { searchRestaurantsAction } from '@/actions/restaurants'
import { AddRestaurantForm } from '@/components/restaurants/add-restaurant-form'
import { GooglePlacesResults } from '@/components/restaurants/google-places-results'
import { useRestaurantSources } from '@/components/restaurants/restaurant-sources'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { NEARBY_RADII_KM, NEARBY_RADIUS_DEFAULT_KM } from '@/domain/schemas/restaurant'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useGeolocation } from '@/hooks/use-geolocation'
import { captureEvent } from '@/lib/analytics/client'
import { formatDistance } from '@/lib/format'
import { distanceKm, parseGeoPoint, roundGeoPoint } from '@/lib/maps'
import { cn } from '@/lib/utils'

import type { Restaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'

interface RestaurantPickerProps {
  /** Première page, chargée côté serveur */
  initialPage: RestaurantPage
  /** Ids sélectionnés (contrôlé) */
  value: string[]
  onChange: (ids: string[]) => void
  /** Ids déjà présents ailleurs (ex. via une liste) : affichés cochés, non modifiables */
  lockedIds?: string[]
  /** name des inputs hidden pour un envoi via formulaire */
  inputName?: string
  emptyLabel?: string
}

export function RestaurantPicker({
  initialPage,
  value,
  onChange,
  lockedIds = [],
  inputName,
  emptyLabel = 'Aucun restaurant ne correspond.',
}: RestaurantPickerProps) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [page, setPage] = useState<RestaurantPage>(initialPage)
  const [error, setError] = useState<string | null>(null)
  const [isSearching, startSearch] = useTransition()
  const [isLoadingMore, startLoadMore] = useTransition()
  const [isAdding, setIsAdding] = useState(false)
  const sources = useRestaurantSources()
  const [source, setSource] = useState<'base' | 'google'>('base')
  const tabId = useId()
  /** Cache des restaurants vus, pour afficher les sélectionnés même hors résultats */
  const [known, setKnown] = useState<Map<string, Restaurant>>(
    () => new Map(initialPage.items.map((r) => [r.id, r]))
  )

  // « Autour de moi » : une position, deux usages. Elle trie le catalogue par
  // distance et biaise la recherche Google — d'où le partage ici plutôt qu'un
  // bouton par onglet, qui demanderait deux fois la même permission.
  const geo = useGeolocation()
  const [radiusKm, setRadiusKm] = useState<number>(NEARBY_RADIUS_DEFAULT_KM)

  /**
   * Ce qui part au serveur : la position arrondie, jamais celle du GPS. Les
   * distances affichées, elles, restent calculées ici au point exact.
   */
  const near = useMemo(() => {
    if (!geo.position) return undefined
    const { lat, lng } = roundGeoPoint(geo.position)
    return { latitude: lat, longitude: lng, radiusKm }
  }, [geo.position, radiusKm])

  const searchKey = near
    ? `${debouncedQuery}|${near.latitude},${near.longitude},${near.radiusKm}`
    : debouncedQuery
  /** Recherche déjà servie : `initialPage` couvre la première, sans position. */
  const lastSearch = useRef(searchKey)

  function remember(items: Restaurant[]) {
    setKnown((prev) => {
      const next = new Map(prev)
      items.forEach((r) => next.set(r.id, r))
      return next
    })
  }

  const selected = useMemo(() => new Set(value), [value])
  const locked = useMemo(() => new Set(lockedIds), [lockedIds])

  useEffect(() => {
    if (searchKey === lastSearch.current) return
    lastSearch.current = searchKey
    startSearch(async () => {
      const result = await searchRestaurantsAction({ query: debouncedQuery, offset: 0, near })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      remember(result.data.items)
      setPage(result.data)
      if (near) {
        captureEvent('nearby_browsed', {
          radius_km: near.radiusKm,
          results: result.data.items.length,
        })
      }
    })
  }, [searchKey, debouncedQuery, near])

  function loadMore() {
    startLoadMore(async () => {
      const result = await searchRestaurantsAction({
        query: debouncedQuery,
        offset: page.nextOffset,
        near,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      remember(result.data.items)
      setPage((prev) => ({
        items: [...prev.items, ...result.data.items],
        hasMore: result.data.hasMore,
        nextOffset: result.data.nextOffset,
      }))
    })
  }

  function toggle(id: string) {
    if (locked.has(id)) return
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  /**
   * Resto tout juste ajouté (ou doublon existant retenu à sa place) : il
   * rejoint les résultats en tête et devient sélectionné immédiatement, sans
   * attendre une nouvelle recherche.
   */
  function addAndSelect(restaurant: Restaurant) {
    remember([restaurant])
    setPage((prev) =>
      prev.items.some((item) => item.id === restaurant.id)
        ? prev
        : { ...prev, items: [restaurant, ...prev.items] }
    )
    if (!locked.has(restaurant.id) && !selected.has(restaurant.id)) {
      onChange([...value, restaurant.id])
    }
    setIsAdding(false)
  }

  const selectedRestaurants = value
    .map((id) => known.get(id))
    .filter((r): r is Restaurant => Boolean(r))

  return (
    <div className="flex flex-col gap-3">
      {inputName && value.map((id) => <input key={id} type="hidden" name={inputName} value={id} />)}

      <div className="relative">
        <RiSearchLine
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Chercher un resto ou une cuisine"
          aria-label="Chercher un restaurant"
          autoComplete="off"
          className="pl-10"
        />
        {isSearching && <Spinner className="absolute top-1/2 right-3.5 -translate-y-1/2" />}
      </div>

      <div
        className={cn(
          'flex flex-wrap items-center gap-2',
          sources.google ? 'justify-between' : 'justify-end'
        )}
      >
        {sources.google && (
          <div role="tablist" aria-label="Source des restaurants" className="flex gap-1.5">
            {(
              [
                ['base', 'Base'],
                ['google', 'Google'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`${tabId}-tab-${key}`}
                aria-selected={source === key}
                aria-controls={`${tabId}-panel`}
                onClick={() => setSource(key)}
                className={cn(
                  'h-9 rounded-md px-3 text-sm font-semibold transition-colors',
                  source === key
                    ? 'bg-brand-soft text-brand-hover'
                    : 'text-muted-foreground hover:bg-surface-2 hover:text-ink'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {geo.position ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft py-1 pr-1 pl-3 text-xs font-semibold text-brand-hover">
            <RiMapPin2Line aria-hidden="true" className="size-3.5" />
            Autour de moi
            <button
              type="button"
              onClick={geo.clear}
              aria-label="Revenir à toute la base"
              className="rounded-full p-1 hover:bg-brand hover:text-on-brand"
            >
              <RiCloseLine aria-hidden="true" className="size-3.5" />
            </button>
          </span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={geo.request}
            disabled={geo.status === 'locating'}
          >
            {geo.status === 'locating' ? <Spinner /> : <RiMapPin2Line aria-hidden="true" />}
            Autour de moi
          </Button>
        )}
      </div>

      <FormMessage error={geo.error} />

      {selectedRestaurants.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Restaurants sélectionnés">
          {selectedRestaurants.map((restaurant) => (
            <li key={restaurant.id}>
              <button
                type="button"
                onClick={() => toggle(restaurant.id)}
                className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-1 pr-2 pl-3 text-xs font-semibold text-brand-hover hover:bg-brand hover:text-on-brand"
                aria-label={`Retirer ${restaurant.name}`}
              >
                {restaurant.name}
                <RiCloseLine aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        className="flex flex-col gap-3"
        id={`${tabId}-panel`}
        role={sources.google ? 'tabpanel' : undefined}
        aria-labelledby={sources.google ? `${tabId}-tab-${source}` : undefined}
      >
        {source === 'google' ? (
          <GooglePlacesResults
            query={debouncedQuery}
            position={geo.position}
            onImported={addAndSelect}
          />
        ) : (
          <>
            {isAdding ? (
              <AddRestaurantForm
                defaultName={query.trim()}
                onAdded={addAndSelect}
                onCancel={() => setIsAdding(false)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsAdding(true)}>
                  <RiAddLine aria-hidden="true" />
                  Ajouter un resto
                </Button>

                {near && (
                  <div role="group" aria-label="Rayon autour de moi" className="flex gap-1">
                    {NEARBY_RADII_KM.map((km) => (
                      <button
                        key={km}
                        type="button"
                        aria-pressed={radiusKm === km}
                        onClick={() => setRadiusKm(km)}
                        className={cn(
                          'h-8 rounded-full px-3 text-xs font-semibold transition-colors',
                          radiusKm === km
                            ? 'bg-brand-soft text-brand-hover'
                            : 'text-muted-foreground hover:bg-surface-2 hover:text-ink'
                        )}
                      >
                        {km} km
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-veto">
                {error}
              </p>
            )}

            <ul
              className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg bg-surface p-1.5 ring-1 ring-line"
              aria-label={near ? 'Restaurants autour de moi' : 'Résultats'}
            >
              {page.items.length === 0 && !isSearching && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {near ? 'Aucun resto connu dans ce rayon.' : emptyLabel}
                  {!isAdding && (
                    <>
                      {' '}
                      <button
                        type="button"
                        onClick={() => setIsAdding(true)}
                        className="font-semibold text-brand underline-offset-4 hover:underline"
                      >
                        Ajoute-le
                      </button>
                      .
                    </>
                  )}
                </li>
              )}
              {page.items.map((restaurant) => {
                const isLocked = locked.has(restaurant.id)
                const isSelected = isLocked || selected.has(restaurant.id)
                const distance = distanceLabel(geo.position, restaurant)
                return (
                  <li key={restaurant.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-disabled={isLocked || undefined}
                      onClick={() => toggle(restaurant.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
                        isSelected ? 'bg-brand-soft' : 'hover:bg-surface-2',
                        isLocked && 'cursor-default opacity-70'
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-full border',
                          isSelected ? 'border-brand bg-brand text-on-brand' : 'border-line-strong'
                        )}
                      >
                        {isSelected && <RiCheckLine className="size-3.5" />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{restaurant.name}</span>
                        {restaurant.description && (
                          <span className="truncate text-xs text-muted-foreground">
                            {restaurant.description}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        {distance && (
                          <span className="text-[0.68rem] font-semibold text-brand-hover">
                            à {distance}
                          </span>
                        )}
                        {restaurant.cuisine_type && (
                          <span className="font-mono text-[0.68rem] tracking-wide text-muted-foreground uppercase">
                            {restaurant.cuisine_type}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
              {page.hasMore && (
                <li className="p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? <Spinner /> : 'Afficher plus'}
                  </Button>
                </li>
              )}
            </ul>

            {near && (
              <p className="text-xs text-muted-foreground">
                Du plus proche au plus loin. Un resto dont on ignore les coordonnées n’apparaît pas
                ici — la recherche par nom le trouve toujours, et l’onglet Google en ajoute de
                nouveaux.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Distance affichée sur une ligne de résultat, `null` sans position autorisée
 * ou sans coordonnées connues pour ce resto.
 */
function distanceLabel(
  position: { lat: number; lng: number } | null,
  restaurant: Restaurant
): string | null {
  if (!position) return null
  const point = parseGeoPoint(restaurant.location)
  return point ? formatDistance(distanceKm(position, point)) : null
}
