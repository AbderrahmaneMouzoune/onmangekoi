'use client'

import { ResultRow } from '@/components/restaurants/result-row'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

import type { Restaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'

interface CatalogResultsProps {
  page: RestaurantPage
  isSearching: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  isSelected: (id: string) => boolean
  isLocked: (id: string) => boolean
  onToggle: (restaurant: Restaurant) => void
  emptyLabel: string
  /** Ouvre l'ajout manuel, prérempli avec la recherche en cours. */
  onAddManually: () => void
}

/**
 * Onglet « Le carnet » : tous les restos déjà connus de l'app, filtrés par la
 * recherche. Rien ne correspond ? Le resto s'ajoute à la main, sans quitter
 * le formulaire.
 */
export function CatalogResults({
  page,
  isSearching,
  isLoadingMore,
  onLoadMore,
  isSelected,
  isLocked,
  onToggle,
  emptyLabel,
  onAddManually,
}: CatalogResultsProps) {
  return (
    <ul
      className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg bg-surface p-1.5 ring-1 ring-line"
      aria-label="Résultats"
      aria-busy={isSearching || undefined}
    >
      {page.items.length === 0 && !isSearching && (
        <li className="px-3 py-6 text-center text-sm text-muted-foreground">
          {emptyLabel}{' '}
          <button
            type="button"
            onClick={onAddManually}
            className="font-semibold text-brand underline-offset-4 hover:underline"
          >
            Ajoute-le
          </button>
          .
        </li>
      )}
      {page.items.map((restaurant) => {
        const locked = isLocked(restaurant.id)
        return (
          <li key={restaurant.id}>
            <ResultRow
              name={restaurant.name}
              subtitle={restaurant.description}
              meta={
                restaurant.cuisine_type ? (
                  <span className="font-mono tracking-wide uppercase">
                    {restaurant.cuisine_type}
                  </span>
                ) : undefined
              }
              checked={locked || isSelected(restaurant.id)}
              locked={locked}
              onToggle={() => onToggle(restaurant)}
            />
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
            onClick={onLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? <Spinner /> : 'Afficher plus'}
          </Button>
        </li>
      )}
    </ul>
  )
}
