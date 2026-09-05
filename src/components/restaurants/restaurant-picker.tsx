'use client'

import { RiCheckLine, RiCloseLine, RiSearchLine } from '@remixicon/react'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { searchRestaurantsAction } from '@/actions/restaurants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
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
  /** Cache des restaurants vus, pour afficher les sélectionnés même hors résultats */
  const [known, setKnown] = useState<Map<string, Restaurant>>(
    () => new Map(initialPage.items.map((r) => [r.id, r]))
  )
  const lastQuery = useRef('')

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

      {error && (
        <p role="alert" className="text-sm text-veto">
          {error}
        </p>
      )}

      <ul
        className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg bg-surface p-1.5 ring-1 ring-line"
        aria-label="Résultats"
      >
        {page.items.length === 0 && !isSearching && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</li>
        )}
        {page.items.map((restaurant) => {
          const isLocked = locked.has(restaurant.id)
          const isSelected = isLocked || selected.has(restaurant.id)
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
                {restaurant.cuisine_type && (
                  <span className="shrink-0 font-mono text-[0.68rem] tracking-wide text-muted-foreground uppercase">
                    {restaurant.cuisine_type}
                  </span>
                )}
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
    </div>
  )
}
