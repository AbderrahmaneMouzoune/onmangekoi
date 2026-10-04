'use client'

import { RiMapPin2Fill, RiMapPin2Line } from '@remixicon/react'
import { useLocale, useTranslations } from 'next-intl'

import { RecentWinnerBadge } from '@/components/restaurants/recent-winner-badge'
import { ResultRow } from '@/components/restaurants/result-row'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { constraintConflicts, NO_FOOD_CONSTRAINTS, ownConflict } from '@/domain/food-constraints'
import { NO_RECENT_WINNERS } from '@/domain/recent-winners'
import { PRICE_LEVEL_LABELS } from '@/domain/schemas/restaurant'
import { useArrowNavigation } from '@/hooks/use-arrow-navigation'
import { distanceLabel, geoPoint } from '@/lib/maps'
import { cn } from '@/lib/utils'

import type { Restaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'
import type { FoodConstraints, OwnConflict } from '@/domain/food-constraints'
import type { RecentWinnerDates } from '@/domain/recent-winners'
import type { Geolocation } from '@/hooks/use-geolocation'

interface CatalogResultsProps {
  page: RestaurantPage
  /** Position de la personne, tenue par le sélecteur : la distance de chaque resto géolocalisé. */
  geolocation: Geolocation
  isSearching: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  isSelected: (id: string) => boolean
  isLocked: (id: string) => boolean
  onToggle: (restaurant: Restaurant) => void
  /** Phrase quand rien ne correspond ; par défaut, celle du carnet. */
  emptyLabel?: string
  /** Ouvre l'ajout manuel, prérempli avec la recherche en cours. */
  onAddManually: () => void
  /** Lève les filtres du carnet. Absent quand il n'y en a aucun de posé. */
  onClearFilters?: () => void
  /** Anti-fatigue : date du dernier sacre, par restaurant */
  recentWinners?: RecentWinnerDates
  /** Anti-fatigue actif : un gagnant récent est écarté, donc ni coché ni cochable */
  excludeRecent?: boolean
  /** Ses propres contraintes alimentaires : un resto qui les heurte est badgé (#60) */
  myConstraints?: FoodConstraints
}

/** Ligne d'adresse d'un resto du carnet : rue et ville, sinon sa description. */
function placeLine(restaurant: Restaurant): string | null {
  const line = [restaurant.address, restaurant.city].filter(Boolean).join(', ')
  return line || restaurant.description || null
}

/**
 * Onglet « Le carnet » : tous les restos déjà connus de l'app, filtrés par la
 * recherche. « Autour de moi » demande la position — la même que l'onglet
 * Google — et chaque resto géolocalisé affiche alors sa distance. Rien ne
 * correspond ? Le resto s'ajoute à la main, sans quitter le formulaire.
 */
export function CatalogResults({
  page,
  geolocation,
  isSearching,
  isLoadingMore,
  onLoadMore,
  isSelected,
  isLocked,
  onToggle,
  emptyLabel,
  onAddManually,
  onClearFilters,
  recentWinners = NO_RECENT_WINNERS,
  excludeRecent = false,
  myConstraints = NO_FOOD_CONSTRAINTS,
}: CatalogResultsProps) {
  const here = geoPoint(geolocation.position)
  const isLocating = geolocation.status === 'locating'
  const onKeyDown = useArrowNavigation()
  const t = useTranslations('restaurants')
  const locale = useLocale()

  /** Ses propres contraintes : « Pas halal », « Hors budget », « Pas pour toi ». */
  function notForMeLabel(conflict: OwnConflict | null): string | null {
    if (!conflict) return null
    if (conflict.kind === 'tag') return t(`notForMe.tags.${conflict.tag}`)
    return t(`notForMe.${conflict.kind}`)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {here ? t('catalog.captionNearby') : t('catalog.caption')}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={here !== null}
          onClick={here ? geolocation.clear : geolocation.locate}
          disabled={isLocating}
          className={cn(here && 'bg-brand-soft text-brand-hover hover:bg-brand-soft')}
        >
          {isLocating ? (
            <Spinner />
          ) : here ? (
            <RiMapPin2Fill aria-hidden="true" />
          ) : (
            <RiMapPin2Line aria-hidden="true" />
          )}
          {here ? t('geo.aroundYou') : t('geo.aroundMe')}
        </Button>
      </div>

      {geolocation.error && !here && (
        <p role="status" className="text-xs text-muted-foreground">
          {geolocation.error}
        </p>
      )}

      <ul
        onKeyDown={onKeyDown}
        className="flex max-h-[26rem] flex-col gap-1 overflow-y-auto overscroll-contain rounded-lg bg-surface p-1.5 ring-1 ring-line lg:max-h-[30rem]"
        aria-label={t('catalog.label')}
        aria-busy={isSearching || undefined}
      >
        {page.items.length === 0 && !isSearching && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            {/* Des filtres sont posés : le carnet n'est pas vide, il est
                restreint. On propose de les lever plutôt que d'ajouter un
                resto qui s'y trouve peut-être déjà. */}
            {onClearFilters ? t('catalog.noMatchFilters') : (emptyLabel ?? t('picker.empty'))}{' '}
            <button
              type="button"
              onClick={onClearFilters ?? onAddManually}
              className="font-semibold text-brand underline-offset-4 hover:underline"
            >
              {onClearFilters ? t('catalog.clearFilters') : t('catalog.addIt')}
            </button>
            .
          </li>
        )}
        {page.items.map((restaurant) => {
          const wonAt = recentWinners[restaurant.id]
          const excluded = excludeRecent && wonAt !== undefined
          // Écartée, la carte se grise comme une carte verrouillée — mais
          // décochée : c'est bien ce qui n'ira pas dans la session.
          const locked = excluded || isLocked(restaurant.id)
          const distance = distanceLabel(here, restaurant.location, locale)
          // Ses propres contraintes : on peut les nommer. Un signal, pas un
          // filtre — la ligne reste cochable.
          const notForMe = notForMeLabel(
            ownConflict(constraintConflicts(restaurant, myConstraints))
          )
          return (
            <li key={restaurant.id}>
              <ResultRow
                name={restaurant.name}
                photoUrl={restaurant.photo_url}
                facts={<Facts cuisine={restaurant.cuisine_type} price={restaurant.price_level} />}
                subtitle={placeLine(restaurant)}
                openingHours={restaurant.opening_hours}
                meta={
                  wonAt || distance || notForMe ? (
                    <>
                      {wonAt && <RecentWinnerBadge wonAt={wonAt} excluded={excluded} />}
                      {notForMe && (
                        <span className="rounded-full bg-veto-soft px-2 py-0.5 font-medium text-veto">
                          {notForMe}
                        </span>
                      )}
                      {distance && <span className="font-medium text-ink-2">{distance}</span>}
                    </>
                  ) : undefined
                }
                checked={!excluded && (locked || isSelected(restaurant.id))}
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
              {isLoadingMore ? <Spinner /> : t('catalog.more')}
            </Button>
          </li>
        )}
      </ul>
    </div>
  )
}

/** Cuisine · budget, séparés d'un point médian ; rien si on ne sait rien. */
export function Facts({
  cuisine,
  price,
  children,
}: {
  cuisine?: string | null
  price?: number | null
  children?: React.ReactNode
}) {
  const items = [cuisine, price ? PRICE_LEVEL_LABELS[price] : null, children].filter(Boolean)
  if (items.length === 0) return null
  return (
    <>
      {items.map((item, index) => (
        <span key={index} className="inline-flex items-center gap-1.5">
          {index > 0 && <span aria-hidden="true">·</span>}
          {item}
        </span>
      ))}
    </>
  )
}
