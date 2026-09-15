'use client'

import { RiBookmarkFill, RiCloseLine } from '@remixicon/react'

import { countLabel } from '@/lib/format'

import type { Restaurant } from '@/data-access/models'

export interface BasketList {
  id: string
  name: string
  restaurantCount: number
}

interface SelectionBasketProps {
  lists: BasketList[]
  restaurants: Restaurant[]
  /** Restos comptés en tout, listes dépliées et doublons retirés. */
  total: number
  onRemoveList: (id: string) => void
  onRemoveRestaurant: (id: string) => void
}

/**
 * Ce qu'on a pris jusqu'ici, toutes sources confondues. Une liste entière
 * tient dans une pastille dorée — la couleur des favoris — et chaque resto
 * pioché à l'unité dans une pastille rouge. Un clic retire l'un ou l'autre,
 * sans avoir à retrouver l'onglet d'où il venait.
 */
export function SelectionBasket({
  lists,
  restaurants,
  total,
  onRemoveList,
  onRemoveRestaurant,
}: SelectionBasketProps) {
  if (lists.length === 0 && restaurants.length === 0) return null

  return (
    <section aria-label="Ta sélection" className="flex flex-col gap-2">
      <p className="flex items-baseline justify-between text-sm">
        <span className="font-medium">Ta sélection</span>
        <span className="font-mono text-xs text-muted-foreground tabular">
          {countLabel(total, 'resto')}
        </span>
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Sélection">
        {lists.map((list) => (
          <li key={list.id}>
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
          <li key={restaurant.id}>
            <button
              type="button"
              onClick={() => onRemoveRestaurant(restaurant.id)}
              className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-1 pr-2 pl-3 text-xs font-semibold text-brand-hover transition-colors hover:bg-brand hover:text-on-brand"
              aria-label={`Retirer ${restaurant.name}`}
            >
              {restaurant.name}
              <RiCloseLine aria-hidden="true" className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
