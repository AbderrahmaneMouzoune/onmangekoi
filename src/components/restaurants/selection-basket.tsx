'use client'

import { RiBookmarkFill, RiCloseLine } from '@remixicon/react'
import { useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useArrowNavigation } from '@/hooks/use-arrow-navigation'
import { countLabel } from '@/lib/format'

import type { Restaurant } from '@/data-access/models'
import type { PlaceResult } from '@/domain/places'

export interface BasketList {
  id: string
  name: string
  restaurantCount: number
}

interface SelectionBasketProps {
  lists: BasketList[]
  restaurants: Restaurant[]
  /** Lieux Google cochés dont la fiche arrive : déjà dans le panier, pas encore retirables. */
  pending?: PlaceResult[]
  /** Restos comptés en tout, listes dépliées, doublons retirés, imports en cours compris. */
  total: number
  onRemoveList: (id: string) => void
  onRemoveRestaurant: (id: string) => void
  /** Vide tout le panier d'un coup, listes comprises. */
  onClear: () => void
}

const NONE: PlaceResult[] = []

/**
 * Ce qu'on a pris jusqu'ici, toutes sources confondues. Une liste entière
 * tient dans une pastille dorée — la couleur des favoris — et chaque resto
 * pioché à l'unité dans une pastille rouge. Un clic retire l'un ou l'autre,
 * sans avoir à retrouver l'onglet d'où il venait. Un import Google en cours
 * y figure déjà, avec sa roue : le geste a été fait, la fiche suit.
 *
 * Les pastilles tiennent sur **une seule ligne**, qui défile : le panier
 * garde la même hauteur qu'on ait pris deux restos ou vingt, et la liste de
 * résultats en dessous ne descend jamais. Le dernier pris est amené dans le
 * champ pour qu'on le voie arriver.
 */
export function SelectionBasket({
  lists,
  restaurants,
  pending = NONE,
  total,
  onRemoveList,
  onRemoveRestaurant,
  onClear,
}: SelectionBasketProps) {
  const onKeyDown = useArrowNavigation('both')
  const strip = useRef<HTMLUListElement>(null)
  const count = lists.length + restaurants.length + pending.length

  useEffect(() => {
    const element = strip.current
    // jsdom n'implémente pas `scrollTo` : on ne défile que là où on peut.
    if (!element || typeof element.scrollTo !== 'function') return
    element.scrollTo({ left: element.scrollWidth, behavior: 'smooth' })
  }, [count])

  if (count === 0) return null

  return (
    <section aria-label="Ta sélection" className="flex flex-col gap-1.5">
      <p className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">Ta sélection</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground tabular">
            {countLabel(total, 'resto')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-my-2 h-8 px-2 text-muted-foreground"
            onClick={onClear}
          >
            Tout retirer
          </Button>
        </span>
      </p>
      <ul
        ref={strip}
        onKeyDown={onKeyDown}
        className="flex [scrollbar-width:thin] gap-1.5 overflow-x-auto py-0.5"
        aria-label="Sélection"
      >
        {lists.map((list) => (
          <li key={list.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onRemoveList(list.id)}
              className="inline-flex items-center gap-1.5 rounded-full bg-fav-soft py-1 pr-2 pl-2.5 text-xs font-semibold text-fav transition-colors hover:bg-fav hover:text-surface"
              aria-label={`Retirer la liste ${list.name}`}
            >
              <RiBookmarkFill aria-hidden="true" className="size-3.5" />
              {list.name}
              <span className="font-mono font-medium tabular">{list.restaurantCount}</span>
              <RiCloseLine aria-hidden="true" className="size-3.5" />
            </button>
          </li>
        ))}
        {restaurants.map((restaurant) => (
          <li key={restaurant.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onRemoveRestaurant(restaurant.id)}
              className="inline-flex max-w-48 items-center gap-1 rounded-full bg-brand-soft py-1 pr-2 pl-3 text-xs font-semibold text-brand-hover transition-colors hover:bg-brand hover:text-on-brand"
              aria-label={`Retirer ${restaurant.name}`}
            >
              <span className="truncate">{restaurant.name}</span>
              <RiCloseLine aria-hidden="true" className="size-3.5 shrink-0" />
            </button>
          </li>
        ))}
        {pending.map((place) => (
          <li key={place.placeId} className="shrink-0">
            <span
              role="status"
              aria-label={`${place.name}, import en cours`}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft py-1 pr-2.5 pl-3 text-xs font-semibold text-brand-hover"
            >
              {place.name}
              <Spinner className="size-3.5" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
