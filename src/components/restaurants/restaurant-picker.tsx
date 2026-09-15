'use client'

import {
  RiAddLine,
  RiBookmarkLine,
  RiContactsBook2Line,
  RiGoogleLine,
  RiSearchLine,
} from '@remixicon/react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'

import { importPlaceAction } from '@/actions/places'
import { searchRestaurantsAction } from '@/actions/restaurants'
import { AddRestaurantForm } from '@/components/restaurants/add-restaurant-form'
import { CatalogResults } from '@/components/restaurants/catalog-results'
import { GooglePlacesResults } from '@/components/restaurants/google-places-results'
import { ListSourcePanel } from '@/components/restaurants/list-source-panel'
import { useRestaurantSources } from '@/components/restaurants/restaurant-sources'
import { SelectionBasket } from '@/components/restaurants/selection-basket'
import {
  SourceTabs,
  sourcePanelId,
  sourceTabId,
  type RestaurantSource,
  type SourceTab,
} from '@/components/restaurants/source-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useGeolocation } from '@/hooks/use-geolocation'

import type { ListWithRestaurantIds } from '@/data-access/lists'
import type { Restaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'
import type { PlaceResult, PlacesPage } from '@/domain/places'

const NO_LISTS: ListWithRestaurantIds[] = []
const NO_IDS: string[] = []

const SEARCH_PLACEHOLDER: Record<RestaurantSource, string> = {
  lists: '',
  base: 'Chercher un resto ou une cuisine',
  google: 'Chercher un resto chez Google',
}

interface RestaurantPickerProps {
  /** Première page du carnet, chargée côté serveur */
  initialPage: RestaurantPage
  /** Ids sélectionnés à l'unité (contrôlé) */
  value: string[]
  onChange: (ids: string[]) => void
  /** Ids déjà présents ailleurs (ex. déjà dans la liste qu'on édite) : cochés, non modifiables */
  lockedIds?: string[]
  /** name des inputs hidden pour un envoi via formulaire */
  inputName?: string
  emptyLabel?: string
  /**
   * Listes de favoris proposées comme source, au même niveau que le carnet et
   * Google. Une liste cochée verse tous ses restos dans la sélection ; ils
   * apparaissent alors cochés et verrouillés dans les autres onglets.
   */
  lists?: ListWithRestaurantIds[]
  selectedListIds?: string[]
  onListsChange?: (ids: string[]) => void
  /** name des inputs hidden portant les listes cochées */
  listsInputName?: string
}

/**
 * Sélecteur de restaurants.
 *
 * Trois sources au même niveau — mes listes, le carnet des restos déjà
 * connus, Google — et un seul panier : on pioche dans l'une, on complète
 * dans l'autre, et ce qu'on a pris reste visible au-dessus des onglets quel
 * que soit celui qui est ouvert. L'onglet Google s'ouvre sur les restos
 * autour de soi, sans rien taper, et garde ses résultats d'un passage à
 * l'autre.
 */
export function RestaurantPicker({
  initialPage,
  value,
  onChange,
  lockedIds = NO_IDS,
  inputName,
  emptyLabel = 'Aucun resto du carnet ne correspond.',
  lists = NO_LISTS,
  selectedListIds = NO_IDS,
  onListsChange,
  listsInputName,
}: RestaurantPickerProps) {
  const sources = useRestaurantSources()
  const hasLists = Boolean(onListsChange) && lists.length > 0

  const tabs = useMemo<SourceTab[]>(
    () => [
      ...(hasLists
        ? [
            {
              key: 'lists' as const,
              label: 'Mes listes',
              icon: <RiBookmarkLine aria-hidden="true" />,
              count: selectedListIds.length,
            },
          ]
        : []),
      {
        key: 'base' as const,
        label: 'Le carnet',
        icon: <RiContactsBook2Line aria-hidden="true" />,
      },
      ...(sources.google
        ? [{ key: 'google' as const, label: 'Google', icon: <RiGoogleLine aria-hidden="true" /> }]
        : []),
    ],
    [hasLists, selectedListIds.length, sources.google]
  )

  const [source, setSource] = useState<RestaurantSource>(hasLists ? 'lists' : 'base')
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [page, setPage] = useState<RestaurantPage>(initialPage)
  const [error, setError] = useState<string | null>(null)
  const [isSearching, startSearch] = useTransition()
  const [isLoadingMore, startLoadMore] = useTransition()
  const [isAdding, setIsAdding] = useState(false)
  const geolocation = useGeolocation()
  const idPrefix = useId()
  /** Cache des restaurants vus, pour afficher les sélectionnés même hors résultats */
  const [known, setKnown] = useState<Map<string, Restaurant>>(
    () => new Map(initialPage.items.map((r) => [r.id, r]))
  )
  const lastQuery = useRef('')

  /** Pages Google déjà reçues : l'onglet les retrouve telles quelles quand on y revient. */
  const [placesCache, setPlacesCache] = useState<Map<string, PlacesPage>>(() => new Map())
  const cachePlaces = useCallback((key: string, placesPage: PlacesPage) => {
    setPlacesCache((prev) => new Map(prev).set(key, placesPage))
  }, [])

  /** Lieux Google cochés dont la fiche est encore en route : sélectionnés d'avance. */
  const [pendingPlaces, setPendingPlaces] = useState<Map<string, PlaceResult>>(() => new Map())
  const [importError, setImportError] = useState<string | null>(null)

  function remember(items: Restaurant[]) {
    setKnown((prev) => {
      const next = new Map(prev)
      items.forEach((r) => next.set(r.id, r))
      return next
    })
  }

  const selected = useMemo(() => new Set(value), [value])

  /** Restos versés par les listes cochées : verrouillés dans les autres onglets. */
  const fromLists = useMemo(() => {
    const ids = new Set<string>()
    for (const list of lists) {
      if (selectedListIds.includes(list.id)) list.restaurant_ids.forEach((id) => ids.add(id))
    }
    return ids
  }, [lists, selectedListIds])

  const locked = useMemo(() => new Set([...lockedIds, ...fromLists]), [lockedIds, fromLists])

  /** Les mêmes restos, indexés par lieu Google : un résultat Google déjà en base se coche sans import. */
  const knownByPlaceId = useMemo(() => {
    const index = new Map<string, Restaurant>()
    for (const restaurant of known.values()) {
      if (restaurant.place_id) index.set(restaurant.place_id, restaurant)
    }
    return index
  }, [known])

  /**
   * La sélection telle qu'elle est *maintenant*, pour les gestes qui
   * aboutissent plus tard (un import) : entre-temps la personne a pu cocher
   * d'autres restos, et la fermeture du clic ne les connaît pas.
   */
  const latest = useRef({ value, selected, locked })
  useEffect(() => {
    latest.current = { value, selected, locked }
  })

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

  function selectSource(next: RestaurantSource) {
    setSource(next)
    setIsAdding(false)
    // La position se demande au clic sur l'onglet, une seule fois : c'est
    // le geste qui dit « montre-moi ce qu'il y a autour », et le navigateur
    // ne redemande pas une autorisation déjà donnée.
    if (next === 'google' && geolocation.status === 'idle') geolocation.locate()
  }

  function toggle(restaurant: Restaurant) {
    if (locked.has(restaurant.id)) return
    remember([restaurant])
    onChange(
      selected.has(restaurant.id)
        ? value.filter((id) => id !== restaurant.id)
        : [...value, restaurant.id]
    )
  }

  function toggleList(id: string) {
    onListsChange?.(
      selectedListIds.includes(id)
        ? selectedListIds.filter((v) => v !== id)
        : [...selectedListIds, id]
    )
  }

  /**
   * Resto tout juste ajouté ou importé (ou doublon existant retenu à sa
   * place) : il rejoint le carnet en tête et devient sélectionné
   * immédiatement, sans attendre une nouvelle recherche.
   */
  function addAndSelect(restaurant: Restaurant) {
    remember([restaurant])
    setPage((prev) =>
      prev.items.some((item) => item.id === restaurant.id)
        ? prev
        : { ...prev, items: [restaurant, ...prev.items] }
    )
    const current = latest.current
    if (!current.locked.has(restaurant.id) && !current.selected.has(restaurant.id)) {
      onChange([...current.value, restaurant.id])
    }
    setIsAdding(false)
  }

  /**
   * Import d'un lieu Google, optimiste : la ligne et le panier le montrent
   * coché à l'instant du clic, la fiche arrive derrière. Si l'import échoue,
   * il disparaît de la sélection et l'onglet dit pourquoi.
   */
  function importPlace(place: PlaceResult) {
    setImportError(null)
    setPendingPlaces((prev) => new Map(prev).set(place.placeId, place))
    importPlaceAction(place.placeId).then((result) => {
      setPendingPlaces((prev) => {
        const next = new Map(prev)
        next.delete(place.placeId)
        return next
      })
      if (!result.ok) {
        setImportError(result.error)
        return
      }
      addAndSelect(result.data)
    })
  }

  const selectedRestaurants = value
    .map((id) => known.get(id))
    .filter((r): r is Restaurant => Boolean(r))
  const selectedLists = lists
    .filter((list) => selectedListIds.includes(list.id))
    .map((list) => ({ id: list.id, name: list.name, restaurantCount: list.restaurant_ids.length }))
  const pending = [...pendingPlaces.values()]
  const pendingIds = useMemo(() => new Set(pendingPlaces.keys()), [pendingPlaces])
  const total = new Set([...fromLists, ...value]).size + pending.length

  const showSearch = source !== 'lists' && !isAdding
  const hasTabs = tabs.length > 1

  return (
    <div className="flex flex-col gap-3">
      {inputName && value.map((id) => <input key={id} type="hidden" name={inputName} value={id} />)}
      {listsInputName &&
        selectedListIds.map((id) => (
          <input key={id} type="hidden" name={listsInputName} value={id} />
        ))}

      <SelectionBasket
        lists={selectedLists}
        restaurants={selectedRestaurants}
        pending={pending}
        total={total}
        onRemoveList={toggleList}
        onRemoveRestaurant={(id) => onChange(value.filter((v) => v !== id))}
      />

      {hasTabs && (
        <SourceTabs tabs={tabs} value={source} onChange={selectSource} idPrefix={idPrefix} />
      )}

      <div
        className="flex flex-col gap-3"
        id={sourcePanelId(idPrefix)}
        role={hasTabs ? 'tabpanel' : undefined}
        aria-labelledby={hasTabs ? sourceTabId(idPrefix, source) : undefined}
      >
        {showSearch && (
          <div className="relative">
            <RiSearchLine
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={SEARCH_PLACEHOLDER[source]}
              aria-label="Chercher un restaurant"
              autoComplete="off"
              className="pl-10"
            />
            {isSearching && source === 'base' && (
              <Spinner className="absolute top-1/2 right-3.5 -translate-y-1/2" />
            )}
          </div>
        )}

        {isAdding ? (
          <AddRestaurantForm
            defaultName={query.trim()}
            onAdded={addAndSelect}
            onCancel={() => setIsAdding(false)}
          />
        ) : source === 'lists' ? (
          <ListSourcePanel lists={lists} selectedIds={selectedListIds} onToggle={toggleList} />
        ) : source === 'google' ? (
          <GooglePlacesResults
            query={debouncedQuery}
            geolocation={geolocation}
            cache={placesCache}
            onCached={cachePlaces}
            restaurantForPlace={(placeId) => knownByPlaceId.get(placeId)}
            isSelected={(id) => selected.has(id)}
            isLocked={(id) => locked.has(id)}
            pendingPlaceIds={pendingIds}
            onToggle={toggle}
            onImport={importPlace}
            importError={importError}
          />
        ) : (
          <>
            {error && (
              <p role="alert" className="text-sm text-veto">
                {error}
              </p>
            )}
            <CatalogResults
              page={page}
              isSearching={isSearching}
              isLoadingMore={isLoadingMore}
              onLoadMore={loadMore}
              isSelected={(id) => selected.has(id)}
              isLocked={(id) => locked.has(id)}
              onToggle={toggle}
              emptyLabel={emptyLabel}
              onAddManually={() => setIsAdding(true)}
            />
          </>
        )}

        {showSearch && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Il n’est nulle part ?</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsAdding(true)}>
              <RiAddLine aria-hidden="true" />
              Ajouter un resto à la main
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
