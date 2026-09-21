import { RestaurantThumb } from '@/components/restaurants/restaurant-thumb'

import type { Restaurant } from '@/data-access/models'

/**
 * Le contenu d'une liste, en lecture seule : la même ligne pour qui reçoit le
 * lien et pour qui tombe sur la page publique. Une liste vide le dit plutôt
 * que d'afficher un cadre vide.
 */
export function ListRestaurantRows({
  restaurants,
  emptyLabel = 'Cette liste est encore vide.',
}: {
  restaurants: Restaurant[]
  emptyLabel?: string
}) {
  if (restaurants.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {restaurants.map((restaurant) => (
        <li
          key={restaurant.id}
          className="flex items-center gap-3 rounded-md bg-surface py-2 pr-3 pl-2.5 ring-1 ring-line"
        >
          <RestaurantThumb name={restaurant.name} photoUrl={restaurant.photo_url} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{restaurant.name}</span>
            {(restaurant.cuisine_type || restaurant.city) && (
              <span className="truncate font-mono text-[0.68rem] tracking-wide text-muted-foreground uppercase">
                {[restaurant.cuisine_type, restaurant.city].filter(Boolean).join(' · ')}
              </span>
            )}
            {restaurant.description && (
              <span className="truncate text-xs text-muted-foreground">
                {restaurant.description}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
