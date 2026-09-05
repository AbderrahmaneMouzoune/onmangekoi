'use client'

import { RiMapPin2Line } from '@remixicon/react'
import Image from 'next/image'

import { useOpenNow } from '@/hooks/use-open-now'
import { remoteImageUrl } from '@/lib/images'
import { cn } from '@/lib/utils'

import type { Restaurant } from '@/data-access/models'

interface VoteCardProps {
  restaurant: Restaurant
  index: number
  total: number
  className?: string
  style?: React.CSSProperties
  /** Voile affiché pendant un swipe */
  overlay?: 'yes' | 'no' | null
  /**
   * Carte du dessus : sa photo est chargée en priorité. Celles d'en dessous
   * restent en `lazy` pour ne pas disputer la bande passante au swipe en cours.
   */
  priority?: boolean
}

/** L'ardoise : la carte du restaurant en cours de vote. */
export function VoteCard({
  restaurant,
  index,
  total,
  className,
  style,
  overlay,
  priority = false,
}: VoteCardProps) {
  const place = [restaurant.address, restaurant.city].filter(Boolean).join(', ')
  const photo = remoteImageUrl(restaurant.photo_url)
  const openNow = useOpenNow(restaurant.opening_hours)

  return (
    <article
      aria-label={`${restaurant.name}, restaurant ${index} sur ${total}`}
      style={style}
      className={cn(
        'relative flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-xl chalkboard p-6 shadow-lg select-none sm:aspect-[5/6]',
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
            sizes="(min-width: 640px) 32rem, 100vw"
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
              {openNow ? 'Ouvert' : 'Fermé'}
            </span>
          )}
          {restaurant.cuisine_type && (
            <span className="rounded-full border border-chalk/25 px-2.5 py-1 font-mono text-[0.68rem] tracking-wide text-chalk uppercase">
              {restaurant.cuisine_type}
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
        {place && (
          <p className="flex items-center gap-1.5 text-sm text-chalk-muted">
            <RiMapPin2Line aria-hidden="true" className="size-4 shrink-0" />
            <span className="line-clamp-1">{place}</span>
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
            {overlay === 'yes' ? 'Ça me va' : 'Bof'}
          </span>
        </div>
      )}
    </article>
  )
}
