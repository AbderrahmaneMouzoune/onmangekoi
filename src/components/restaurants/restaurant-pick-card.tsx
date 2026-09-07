'use client'

import { RiAddLine, RiCheckLine, RiMapPin2Line, RiStarFill } from '@remixicon/react'

import { RestaurantThumb } from '@/components/restaurants/restaurant-thumb'
import { Spinner } from '@/components/ui/spinner'
import { PRICE_LEVEL_LABELS } from '@/domain/schemas/restaurant'
import { useOpenNow } from '@/hooks/use-open-now'
import { cn } from '@/lib/utils'

import type { Json } from '@/data-access/models'

export interface RestaurantPickCardProps {
  name: string
  photoUrl?: string | null
  cuisineType?: string | null
  priceLevel?: number | null
  /** Adresse ou résumé : la ligne sous le nom. */
  detail?: string | null
  /** Distance déjà formatée (« 350 m »), quand la position est connue. */
  distance?: string | null
  /** Horaires, pour le badge ouvert / fermé. */
  openingHours?: Json | null
  /** Note Google, affichée seulement sur les résultats de recherche. */
  rating?: { value: number; count: number | null } | null
  /** Coche (base) ou « + » (import Google). */
  control: 'check' | 'add'
  selected?: boolean
  /** Déjà présent ailleurs : coché mais pas modifiable. */
  locked?: boolean
  /** Import en cours sur cette carte. */
  busy?: boolean
  disabled?: boolean
  onClick: () => void
}

const ratingFormatter = new Intl.NumberFormat('fr', { maximumFractionDigits: 1 })

/**
 * Carte d'un resto dans le sélecteur, commune à la base et à Google : une
 * vignette, le nom, une ligne d'infos (cuisine · budget · distance) et la
 * ligne d'adresse. Le bouton entier est le contrôle : une cible large, qu'on
 * soit au doigt ou à la souris.
 */
export function RestaurantPickCard({
  name,
  photoUrl,
  cuisineType,
  priceLevel,
  detail,
  distance,
  openingHours,
  rating,
  control,
  selected = false,
  locked = false,
  busy = false,
  disabled = false,
  onClick,
}: RestaurantPickCardProps) {
  const openNow = useOpenNow(openingHours)
  const isChecked = control === 'check' && (locked || selected)
  const facts = [
    cuisineType,
    priceLevel ? PRICE_LEVEL_LABELS[priceLevel] : null,
    rating ? (
      <span key="rating" className="inline-flex items-center gap-0.5 text-fav">
        <RiStarFill aria-hidden="true" className="size-3" />
        {ratingFormatter.format(rating.value)}
        {rating.count !== null && (
          <span className="text-muted-foreground">({ratingFormatter.format(rating.count)})</span>
        )}
      </span>
    ) : null,
  ].filter(Boolean)

  return (
    <button
      type="button"
      role={control === 'check' ? 'checkbox' : undefined}
      aria-checked={control === 'check' ? isChecked : undefined}
      aria-disabled={locked || undefined}
      aria-busy={busy || undefined}
      aria-label={control === 'add' ? `Importer ${name}` : undefined}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors',
        isChecked ? 'bg-brand-soft' : 'hover:bg-surface-2',
        locked && 'cursor-default opacity-70',
        disabled && 'opacity-60'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border',
          isChecked ? 'border-brand bg-brand text-on-brand' : 'border-line-strong'
        )}
      >
        {busy ? (
          <Spinner className="size-3" />
        ) : isChecked ? (
          <RiCheckLine className="size-3.5" />
        ) : control === 'add' ? (
          <RiAddLine className="size-3.5" />
        ) : null}
      </span>

      <RestaurantThumb name={name} photoUrl={photoUrl} />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{name}</span>
          {openNow !== null && (
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-px font-mono text-[0.6rem] tracking-wide uppercase',
                openNow ? 'bg-yes-soft text-yes' : 'bg-surface-2 text-muted-foreground'
              )}
            >
              {openNow ? 'Ouvert' : 'Fermé'}
            </span>
          )}
        </span>
        {facts.length > 0 && (
          <span className="flex flex-wrap items-center gap-x-1.5 font-mono text-[0.68rem] tracking-wide text-muted-foreground uppercase">
            {facts.map((fact, index) => (
              <span key={index} className="inline-flex items-center gap-1.5">
                {index > 0 && <span aria-hidden="true">·</span>}
                {fact}
              </span>
            ))}
          </span>
        )}
        {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
      </span>

      {distance && (
        <span className="inline-flex shrink-0 items-center gap-1 self-start rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[0.68rem] text-ink-2 tabular">
          <RiMapPin2Line aria-hidden="true" className="size-3" />
          {distance}
        </span>
      )}
    </button>
  )
}
