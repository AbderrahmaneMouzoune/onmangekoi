'use client'

import { RiCheckLine } from '@remixicon/react'

import { RestaurantThumb } from '@/components/restaurants/restaurant-thumb'
import { Spinner } from '@/components/ui/spinner'
import { useOpenNow } from '@/hooks/use-open-now'
import { cn } from '@/lib/utils'

import type { Json } from '@/data-access/models'

interface ResultRowProps {
  name: string
  /** Photo du resto quand on l'a ; sinon la vignette prend ses initiales. */
  photoUrl?: string | null
  /** Ligne de faits sous le nom, en capitales : cuisine, budget, note. */
  facts?: React.ReactNode
  /** Ligne sous les faits : adresse, description. */
  subtitle?: string | null
  /** Horaires, pour le badge ouvert / fermé à côté du nom. */
  openingHours?: Json | null
  /** Colonne de droite : la distance. */
  meta?: React.ReactNode
  checked: boolean
  /** Déjà là par un autre chemin (une liste cochée) : coché, pas modifiable. */
  locked?: boolean
  /** Un aller-retour serveur en cours sur cette ligne (import). */
  busy?: boolean
  disabled?: boolean
  onToggle: () => void
}

/**
 * Une carte de résultat, la même quelle que soit la source : une pastille à
 * cocher, une vignette, un nom et son badge ouvert / fermé, ses faits, sa
 * ligne de détail, et la distance à droite. Ce qui vient de Google ressemble
 * donc à ce qui vient du carnet — c'est le même geste, cocher un resto, et le
 * panier ne fait pas la différence non plus.
 */
export function ResultRow({
  name,
  photoUrl,
  facts,
  subtitle,
  openingHours,
  meta,
  checked,
  locked = false,
  busy = false,
  disabled = false,
  onToggle,
}: ResultRowProps) {
  const openNow = useOpenNow(openingHours)

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={locked || undefined}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors',
        checked ? 'bg-brand-soft' : 'hover:bg-surface-2',
        // `opacity` sur du texte casse le contraste : la ligne verrouillée se
        // grise avec une couleur, qui le tient.
        locked && 'cursor-default text-ink-muted',
        disabled && 'cursor-default'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border',
          checked ? 'border-brand bg-brand text-on-brand' : 'border-line-strong'
        )}
      >
        {busy ? (
          <Spinner className="size-3" />
        ) : checked ? (
          <RiCheckLine className="size-3.5" />
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
        {facts && (
          <span className="flex flex-wrap items-center gap-x-1.5 font-mono text-[0.68rem] tracking-wide text-muted-foreground uppercase">
            {facts}
          </span>
        )}
        {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      {meta && (
        <span className="flex shrink-0 flex-col items-end gap-0.5 self-start text-[0.68rem] text-muted-foreground">
          {meta}
        </span>
      )}
    </button>
  )
}
