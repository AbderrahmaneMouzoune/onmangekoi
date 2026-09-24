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
import { RestaurantFiltersBar } from '@/components/restaurants/restaurant-filters'
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
import { NO_RECENT_WINNERS } from '@/domain/recent-winners'
import { countActiveFilters, NO_FILTERS } from '@/domain/restaurant-filters'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useGeolocation } from '@/hooks/use-geolocation'
import { geoPoint } from '@/lib/maps'

import type { ListWithRestaurantIds } from '@/data-access/lists'
import type { Restaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'
import type { PlaceResult, PlacesPage } from '@/domain/places'
import type { RecentWinnerDates } from '@/domain/recent-winners'
import type { RestaurantFilters } from '@/domain/restaurant-filters'

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
  /** Anti-fatigue : date du dernier sacre, par restaurant — badgée sur la ligne */
  recentWinners?: RecentWinnerDates
  /** Anti-fatigue actif : les gagnants récents sont écartés, donc ni cochés ni cochables */
  excludeRecent?: boolean
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
  /** Pose le focus sur la recherche à l'ouverture (sélecteur affiché à la demande). */
  autoFocus?: boolean
  /** Filtres du carnet au départ — ceux de l'URL, déjà appliqués à `initialPage` */
  defaultFilters?: RestaurantFilters
  /** Appelé à chaque changement de filtre, pour les refléter dans l'URL */
  onFiltersChange?: (filters: RestaurantFilters) => void
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
  recentWinners = NO_RECENT_WINNERS,
  excludeRecent = false,
  inputName,
  emptyLabel = 'Aucun resto du carnet ne correspond.',
  lists = NO_LISTS,
  selectedListIds = NO_IDS,
  onListsChange,
  listsInputName,
  autoFocus = false,
  defaultFilters = NO_FILTERS,
  onFiltersChange,
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
  const [filters, setFilters] = useState<RestaurantFilters>(defaultFilters)
  const geolocation = useGeolocation()
  const idPrefix = useId()
  /** Cache des restaurants vus, pour afficher les sélectionnés même hors résultats */
  const [known, setKnown] = useState<Map<string, Restaurant>>(
    () => new Map(initialPage.items.map((r) => [r.id, r]))
  )
  const addButtonRef = useRef<HTMLButtonElement>(null)

  /** Le formulaire d'ajout disparaît : le focus revient sur le bouton qui l'a ouvert. */
  function closeAddForm() {
    setIsAdding(false)
    requestAnimationFrame(() => addButtonRef.current?.focus())
  }

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

  /** Position de la personne, à la forme de la base : filtre et distances. */
  const here = useMemo(() => geoPoint(geolocation.position), [geolocation.position])

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

  /**
   * Ce qui définit une recherche du carnet. Tout part à la base, filtres
   * compris : c'est la seule façon de garder la pagination juste quand ils se
   * combinent. Le rayon n'a de sens qu'avec une position — sans elle, il ne
   * part pas et les chips de distance disparaissent.
   */
  const criteria = useMemo(
    () => ({
      query: debouncedQuery,
      priceMax: filters.priceMax,
      tags: filters.tags,
      withinKm: here ? filters.withinKm : null,
      origin: here,
    }),
    [debouncedQuery, filters.priceMax, filters.tags, filters.withinKm, here]
  )
  const criteriaKey = JSON.stringify(criteria)
  /**
   * La première page vient du serveur, déjà filtrée par ce que portait l'URL :
   * la relancer au montage serait un aller-retour pour rien.
   */
  const lastCriteria = useRef(criteriaKey)

  useEffect(() => {
    if (criteriaKey === lastCriteria.current) return
    lastCriteria.current = criteriaKey
    startSearch(async () => {
      const result = await searchRestaurantsAction({ ...criteria, offset: 0 })
      // Une recherche plus récente est partie pendant l'aller-retour : c'est
      // elle qui fait foi, ce résultat-ci est déjà périmé.
      if (lastCriteria.current !== criteriaKey) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      remember(result.data.items)
      setPage(result.data)
    })
  }, [criteria, criteriaKey])

  function loadMore() {
    startLoadMore(async () => {
      const result = await searchRestaurantsAction({ ...criteria, offset: page.nextOffset })
      if (!result.ok) {
        setError(result.error)
        return
      }
      remember(result.data.items)
      setPage((prev) => {
        // Un resto entré en tête depuis (import, amorçage) peut revenir dans
        // la page suivante : le décalage d'offset ne doit pas le dédoubler.
        const seen = new Set(prev.items.map((item) => item.id))
        return {
          items: [...prev.items, ...result.data.items.filter((item) => !seen.has(item.id))],
          hasMore: result.data.hasMore,
          nextOffset: result.data.nextOffset,
        }
      })
    })
  }

  function changeFilters(next: RestaurantFilters) {
    setFilters(next)
    onFiltersChange?.(next)
  }

  function selectSource(next: RestaurantSource) {
    setSource(next)
    setIsAdding(false)
    // La position se demande au clic sur l'onglet, une seule fois : c'est
    // le geste qui dit « montre-moi ce qu'il y a autour », et le navigateur
    // ne redemande pas une autorisation déjà donnée.
    if (next === 'google' && geolocation.status === 'idle') geolocation.locate()
  }

  /** Écarté par l'anti-fatigue : la ligne se voit, mais ne se coche plus. */
  function isExcluded(id: string) {
    return excludeRecent && recentWinners[id] !== undefined
  }

  function toggle(restaurant: Restaurant) {
    if (locked.has(restaurant.id) || isExcluded(restaurant.id)) return
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
   * Restos entrés par un amorçage de quartier : ils rejoignent le carnet en
   * tête, sans rien cocher. Remplir la base et composer une session sont deux
   * gestes — personne n'a demandé vingt restos dans son panier.
   */
  function addToCatalog(restaurants: Restaurant[]) {
    remember(restaurants)
    setPage((prev) => {
      const seen = new Set(prev.items.map((item) => item.id))
      const added = restaurants.filter((restaurant) => !seen.has(restaurant.id))
      return added.length > 0 ? { ...prev, items: [...added, ...prev.items] } : prev
    })
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
    if (
      !current.locked.has(restaurant.id) &&
      !current.selected.has(restaurant.id) &&
      !isExcluded(restaurant.id)
    ) {
      onChange([...current.value, restaurant.id])
    }
    closeAddForm()
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

  // Un resto écarté par l'anti-fatigue reste dans `value` — décocher la case
  // le fait revenir — mais il ne compte plus, ni au panier ni au total.
  const selectedRestaurants = value
    .filter((id) => !isExcluded(id))
    .map((id) => known.get(id))
    .filter((r): r is Restaurant => Boolean(r))
  const selectedLists = lists
    .filter((list) => selectedListIds.includes(list.id))
    .map((list) => ({ id: list.id, name: list.name, restaurantCount: list.restaurant_ids.length }))
  const pending = [...pendingPlaces.values()]
  const pendingIds = useMemo(() => new Set(pendingPlaces.keys()), [pendingPlaces])
  const total =
    new Set([...fromLists, ...value].filter((id) => !isExcluded(id))).size + pending.length

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
        onClear={() => {
          onChange([])
          if (selectedListIds.length > 0) onListsChange?.([])
        }}
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
              autoFocus={autoFocus}
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
            onCancel={closeAddForm}
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
            onSeeded={addToCatalog}
            recentWinners={recentWinners}
            excludeRecent={excludeRecent}
          />
        ) : (
          <>
            <RestaurantFiltersBar value={filters} onChange={changeFilters} here={here} />

            {error && (
              <p role="alert" className="text-sm text-veto">
                {error}
              </p>
            )}
            <CatalogResults
              page={page}
              geolocation={geolocation}
              isSearching={isSearching}
              isLoadingMore={isLoadingMore}
              onLoadMore={loadMore}
              isSelected={(id) => selected.has(id)}
              isLocked={(id) => locked.has(id)}
              onToggle={toggle}
              emptyLabel={emptyLabel}
              onAddManually={() => setIsAdding(true)}
              // Rien ne sort alors que des filtres sont posés : le carnet
              // n'est pas vide, il est restreint — on propose de les lever
              // avant de proposer d'ajouter un resto qui existe peut-être.
              onClearFilters={
                countActiveFilters(filters) > 0 ? () => changeFilters(NO_FILTERS) : undefined
              }
              recentWinners={recentWinners}
              excludeRecent={excludeRecent}
            />
          </>
        )}

        {showSearch && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Il n’est nulle part ?</p>
            <Button
              ref={addButtonRef}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAdding(true)}
            >
              <RiAddLine aria-hidden="true" />
              Ajouter un resto à la main
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
