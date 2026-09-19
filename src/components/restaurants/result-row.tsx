'use client'

import { RiCheckLine } from '@remixicon/react'

import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface ResultRowProps {
  name: string
  /** Ligne sous le nom : description, adresse. */
  subtitle?: string | null
  /** Colonne de droite : cuisine, budget, distance. */
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
 * Une ligne de résultat, la même quelle que soit la source : une pastille à
 * cocher, un nom, sa ligne de détail, et ses métadonnées à droite. Ce qui
 * vient de Google ressemble donc à ce qui vient de la base — c'est le même
 * geste, cocher un resto, et le panier ne fait pas la différence non plus.
 */
export function ResultRow({
  name,
  subtitle,
  meta,
  checked,
  locked = false,
  busy = false,
  disabled = false,
  onToggle,
}: ResultRowProps) {
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
        'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
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
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      {meta && (
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-[0.68rem] text-muted-foreground">
          {meta}
        </span>
      )}
    </button>
  )
}
