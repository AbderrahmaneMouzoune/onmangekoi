'use client'

import {
  RiAddLine,
  RiCloseLine,
  RiMapPin2Fill,
  RiMapPin2Line,
  RiSearchLine,
} from '@remixicon/react'
import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'

import { searchRestaurantsAction } from '@/actions/restaurants'
import { AddRestaurantForm } from '@/components/restaurants/add-restaurant-form'
import { GooglePlacesResults } from '@/components/restaurants/google-places-results'
import { RestaurantPickCard } from '@/components/restaurants/restaurant-pick-card'
import { useRestaurantSources } from '@/components/restaurants/restaurant-sources'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useUserPosition } from '@/hooks/use-user-position'
import { countLabel } from '@/lib/format'
import { distanceLabel } from '@/lib/maps'
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

/** Adresse courte d'un resto de la base : rue, ville — ce qu'on a. */
function placeLine(restaurant: Restaurant): string | null {
  const line = [restaurant.address, restaurant.city].filter(Boolean).join(', ')
  return line || restaurant.description || null
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
  const geo = useUserPosition()
  /** Cache des restaurants vus, pour afficher les sélectionnés même hors résultats */
  const [known, setKnown] = useState<Map<string, Restaurant>>(
    () => new Map(initialPage.items.map((r) => [r.id, r]))
  )
  const lastQuery = useRef('')
  const selectionStrip = useRef<HTMLUListElement>(null)

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
    if (debouncedQuery === lastQuery.current) return
    lastQuery.current = debouncedQuery
    startSearch(async () => {
      const result = await searchRestaurantsAction({ query: debouncedQuery, offset: 0 })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      remember(result.data.items)
      setPage(result.data)
    })
  }, [debouncedQuery])

  // La bande de sélection ne grandit jamais en hauteur : le dernier resto
  // choisi part à droite, on y amène le défilement pour qu'il reste visible.
  useEffect(() => {
    const strip = selectionStrip.current
    if (!strip) return
    strip.scrollTo({ left: strip.scrollWidth, behavior: 'smooth' })
  }, [value.length])

  function loadMore() {
    startLoadMore(async () => {
      const result = await searchRestaurantsAction({
        query: debouncedQuery,
        offset: page.nextOffset,
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        {sources.google ? (
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
        ) : (
          <span />
        )}

        {/* La position sert aux deux onglets : distance de chaque resto de
            la base, et biais de la recherche Google. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={geo.position !== null}
          onClick={geo.position ? geo.clear : geo.locate}
          disabled={geo.isLocating}
          className={cn(geo.position && 'bg-brand-soft text-brand-hover hover:bg-brand-soft')}
        >
          {geo.isLocating ? (
            <Spinner />
          ) : geo.position ? (
            <RiMapPin2Fill aria-hidden="true" />
          ) : (
            <RiMapPin2Line aria-hidden="true" />
          )}
          {geo.position ? 'Autour de toi' : 'Autour de moi'}
        </Button>
      </div>

      {geo.error && (
        <p role="status" className="text-xs text-muted-foreground">
          {geo.error}
        </p>
      )}

      {selectedRestaurants.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-surface-2 py-1.5 pr-1.5 pl-3">
          <span className="shrink-0 font-mono text-[0.68rem] tracking-wide text-muted-foreground uppercase tabular">
            {countLabel(selectedRestaurants.length, 'choisi')}
          </span>
          {/* Une seule ligne, qui défile : le sélecteur garde la même
              hauteur qu'on ait choisi deux restos ou vingt. */}
          <ul
            ref={selectionStrip}
            className="flex min-w-0 flex-1 [scrollbar-width:thin] gap-1.5 overflow-x-auto py-0.5"
            aria-label="Restaurants sélectionnés"
          >
            {selectedRestaurants.map((restaurant) => (
              <li key={restaurant.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => toggle(restaurant.id)}
                  className="inline-flex max-w-48 items-center gap-1 rounded-full bg-surface py-1 pr-2 pl-3 text-xs font-semibold text-ink-2 ring-1 ring-line hover:bg-brand hover:text-on-brand hover:ring-brand"
                  aria-label={`Retirer ${restaurant.name}`}
                >
                  <span className="truncate">{restaurant.name}</span>
                  <RiCloseLine aria-hidden="true" className="size-3.5 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={() => onChange([])}
          >
            Tout retirer
          </Button>
        </div>
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setIsAdding(true)}
              >
                <RiAddLine aria-hidden="true" />
                Ajouter un resto
              </Button>
            )}

            {error && (
              <p role="alert" className="text-sm text-veto">
                {error}
              </p>
            )}

            <ul
              className="flex max-h-[26rem] flex-col gap-1 overflow-y-auto overscroll-contain rounded-lg bg-surface p-1.5 ring-1 ring-line"
              aria-label="Résultats"
            >
              {page.items.length === 0 && !isSearching && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {emptyLabel}
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
              {page.items.map((restaurant) => (
                <li key={restaurant.id}>
                  <RestaurantPickCard
                    control="check"
                    name={restaurant.name}
                    photoUrl={restaurant.photo_url}
                    cuisineType={restaurant.cuisine_type}
                    priceLevel={restaurant.price_level}
                    detail={placeLine(restaurant)}
                    distance={distanceLabel(geo.position, restaurant.location)}
                    openingHours={restaurant.opening_hours}
                    selected={selected.has(restaurant.id)}
                    locked={locked.has(restaurant.id)}
                    onClick={() => toggle(restaurant.id)}
                  />
                </li>
              ))}
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
          </>
        )}
      </div>
    </div>
  )
}
