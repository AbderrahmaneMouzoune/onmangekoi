import { RiMapPin2Line } from '@remixicon/react'

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
}

/** L'ardoise : la carte du restaurant en cours de vote. */
export function VoteCard({ restaurant, index, total, className, style, overlay }: VoteCardProps) {
  const place = [restaurant.address, restaurant.city].filter(Boolean).join(', ')

  return (
    <article
      aria-label={`${restaurant.name}, restaurant ${index} sur ${total}`}
      style={style}
      className={cn(
        'relative flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-xl chalkboard p-6 shadow-lg select-none sm:aspect-[5/6]',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-xs tracking-[0.12em] text-chalk-muted uppercase tabular">
          {index} / {total}
        </span>
        {restaurant.cuisine_type && (
          <span className="rounded-full border border-chalk/25 px-2.5 py-1 font-mono text-[0.68rem] tracking-wide text-chalk uppercase">
            {restaurant.cuisine_type}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-[2rem] leading-[1.05] font-extrabold tracking-[-0.03em] text-chalk sm:text-4xl">
          {restaurant.name}
        </h2>
        {restaurant.description && (
          <p className="line-clamp-3 text-base text-chalk/80">{restaurant.description}</p>
        )}
        {place && (
          <p className="flex items-center gap-1.5 text-sm text-chalk-muted">
            <RiMapPin2Line aria-hidden="true" className="size-4" />
            {place}
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
