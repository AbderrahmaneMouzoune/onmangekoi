'use client'

import {
  RiErrorWarningLine,
  RiHistoryLine,
  RiMapPin2Line,
  RiNavigationLine,
} from '@remixicon/react'
import Image from 'next/image'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { blockedCount } from '@/domain/food-constraints'
import { PRICE_LEVEL_LABELS, RESTAURANT_TAGS } from '@/domain/schemas/restaurant'
import { useIsClient } from '@/hooks/use-is-client'
import { useOpenNow } from '@/hooks/use-open-now'
import { remoteImageUrl } from '@/lib/images'
import { distanceLabel } from '@/lib/maps'
import { cn } from '@/lib/utils'

import type { Restaurant } from '@/data-access/models'
import type { GeoPoint } from '@/lib/maps'

interface VoteCardProps {
  restaurant: Restaurant
  index: number
  total: number
  /**
   * Anti-fatigue : date du dernier sacre de ce restaurant dans une session du
   * groupe. Absente quand il n'a rien gagné dans la fenêtre.
   */
  lastWonAt?: string | null
  /**
   * Contraintes alimentaires (#60) : combien de participants ne peuvent pas
   * y manger. Un compte, jamais qui — c'est tout ce que la base en dit.
   */
  blockedCount?: number
  className?: string
  style?: React.CSSProperties
  /** Voile affiché pendant un swipe */
  overlay?: 'yes' | 'no' | null
  /**
   * Carte du dessus : sa photo est chargée en priorité. Celles d'en dessous
   * restent en `lazy` pour ne pas disputer la bande passante au swipe en cours.
   */
  priority?: boolean
  /**
   * Position de la personne, si elle l'a donnée : la carte affiche alors la
   * distance du resto. Sans position ou sans coordonnées, elle n'en parle pas.
   */
  position?: GeoPoint | null
}

/** L'ardoise : la carte du restaurant en cours de vote. */
export function VoteCard({
  restaurant,
  index,
  total,
  lastWonAt,
  blockedCount: blockedCountProp,
  className,
  style,
  overlay,
  priority = false,
  position,
}: VoteCardProps) {
  const t = useTranslations('session.card')
  const tSession = useTranslations('session')
  const tRestaurants = useTranslations('restaurants')
  const locale = useLocale()
  const format = useFormatter()
  const place = [restaurant.address, restaurant.city].filter(Boolean).join(', ')
  const distance = distanceLabel(position, restaurant.location, locale)
  const photo = remoteImageUrl(restaurant.photo_url)
  const openNow = useOpenNow(restaurant.opening_hours)
  // Ordre du catalogue plutôt que celui de la base, qui range par ordre
  // alphabétique : « Végétarien » avant « Sans gluten », comme dans les filtres.
  const tags = RESTAURANT_TAGS.filter((tag) => restaurant.tags.includes(tag))
  // La date ne s'écrit qu'une fois monté, comme les horaires : le rendu
  // serveur n'a pas à trancher le jour d'un sacre survenu vers minuit.
  const isClient = useIsClient()
  const lastWin =
    isClient && lastWonAt
      ? t('lastWin', {
          date: format.dateTime(new Date(lastWonAt), { day: 'numeric', month: 'long' }),
        })
      : null
  const blocked = blockedCount(blockedCountProp)

  return (
    <article
      aria-label={t('label', { name: restaurant.name, index, total })}
      style={style}
      className={cn(
        'relative flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-xl chalkboard p-6 shadow-lg select-none sm:aspect-[5/6] lg:aspect-[4/5]',
        className
      )}
    >
      {photo && (
        // Décoratif : le nom du restaurant est déjà le titre de la carte.
        <div aria-hidden="true" className="absolute inset-0">
          <Image
            src={photo}
            alt=""
            fill
            sizes="(min-width: 1024px) 26rem, (min-width: 640px) 32rem, 100vw"
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            className="object-cover"
          />
          {/* Sans voile, la craie devient illisible sur une photo claire : un
              voile uniforme garantit le contraste partout, le dégradé assoit
              le titre et l'adresse en bas de carte. */}
          <div className="absolute inset-0 bg-slate/65" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate to-transparent" />
        </div>
      )}

      <div className="relative flex items-start justify-between gap-3">
        <span className="font-mono text-xs tracking-[0.12em] text-chalk-muted uppercase tabular">
          {index} / {total}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {openNow !== null && (
            <span
              className={cn(
                'rounded-full border px-2.5 py-1 font-mono text-[0.68rem] tracking-wide uppercase',
                openNow ? 'border-yes/70 text-yes' : 'border-chalk/20 text-chalk-muted'
              )}
            >
              {openNow ? tRestaurants('openNow.open') : tRestaurants('openNow.closed')}
            </span>
          )}
          {restaurant.cuisine_type && (
            <span className="rounded-full border border-chalk/25 px-2.5 py-1 font-mono text-[0.68rem] tracking-wide text-chalk uppercase">
              {restaurant.cuisine_type}
            </span>
          )}
          {restaurant.price_level && (
            <span
              aria-label={t('budget', { level: PRICE_LEVEL_LABELS[restaurant.price_level] })}
              className="rounded-full border border-chalk/25 px-2.5 py-1 font-mono text-[0.68rem] tracking-wide text-chalk"
            >
              {PRICE_LEVEL_LABELS[restaurant.price_level]}
            </span>
          )}
        </div>
      </div>

      <div className="relative flex flex-col gap-3">
        <h2 className="font-display text-[2rem] leading-[1.05] font-extrabold tracking-[-0.03em] text-chalk sm:text-4xl">
          {restaurant.name}
        </h2>
        {restaurant.description && (
          <p className="line-clamp-3 text-base text-chalk/80">{restaurant.description}</p>
        )}
        {tags.length > 0 && (
          <ul aria-label={t('diets')} className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-chalk/10 px-2.5 py-1 text-xs font-semibold text-chalk"
              >
                {tRestaurants(`tags.${tag}`)}
              </li>
            ))}
          </ul>
        )}
        {(place || distance) && (
          <p className="flex items-center gap-3 text-sm text-chalk-muted">
            {distance && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-chalk/15 px-2.5 py-1 font-mono text-xs text-chalk tabular">
                <RiNavigationLine aria-hidden="true" className="size-3.5" />
                {distance}
                <span className="sr-only"> {t('fromYou')}</span>
              </span>
            )}
            {place && (
              <span className="flex min-w-0 items-center gap-1.5">
                <RiMapPin2Line aria-hidden="true" className="size-4 shrink-0" />
                <span className="line-clamp-1">{place}</span>
              </span>
            )}
          </p>
        )}
        {lastWin && (
          <p className="flex items-center gap-1.5 text-sm text-chalk-muted">
            <RiHistoryLine aria-hidden="true" className="size-4 shrink-0" />
            <span className="line-clamp-1">{lastWin}</span>
          </p>
        )}
        {/* Discret mais lisible : c'est ce qui évite de dépenser un veto pour
            dire « je ne peux pas manger là ». */}
        {blocked && (
          <p className="flex items-center gap-1.5 self-start rounded-full border border-chalk/25 px-2.5 py-1 text-sm text-chalk">
            <RiErrorWarningLine aria-hidden="true" className="size-4 shrink-0" />
            <span>{tSession('constraints.blocked', { count: blocked })}</span>
          </p>
        )}
      </div>

      {overlay && (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/30 to-transparent',
            overlay === 'yes' ? 'text-yes' : 'text-no'
          )}
        >
          <span
            className={cn(
              'rotate-[-8deg] rounded-md border-4 px-5 py-2 font-display text-4xl font-extrabold tracking-wide uppercase',
              overlay === 'yes' ? 'border-yes' : 'border-chalk-muted text-chalk-muted'
            )}
          >
            {overlay === 'yes' ? tSession('vote.actions.yes') : tSession('vote.actions.no')}
          </span>
        </div>
      )}
    </article>
  )
}
