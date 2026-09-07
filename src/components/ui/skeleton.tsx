import { cn } from '@/lib/utils'

interface SkeletonProps extends React.ComponentProps<'div'> {
  /** `span` pour rester valide à l'intérieur d'un paragraphe ou d'un titre. */
  as?: 'div' | 'span'
}

export function Skeleton({ as: Tag = 'div', className, ...props }: SkeletonProps) {
  return (
    <Tag
      aria-hidden="true"
      className={cn('block animate-pulse rounded-md bg-surface-2', className)}
      {...props}
    />
  )
}

interface SkeletonRowProps {
  /** Largeur du nom : la varier d'une rangée à l'autre évite l'effet tableau. */
  nameWidth?: string
  /** Largeur de la pastille de droite (statut, badge) — absente par défaut. */
  badgeWidth?: string
  /** Rangée dense, comme les restos d'une liste : un nom et sa ligne de méta. */
  compact?: boolean
  className?: string
}

/**
 * Rangée de carte : le gabarit commun aux sessions, aux listes et aux restos.
 * Reprendre la carte — son anneau, ses deux lignes, sa hauteur exacte — plutôt
 * qu'un bloc plein évite le sursaut au moment où le contenu arrive.
 */
export function SkeletonRow({
  nameWidth,
  badgeWidth,
  compact = false,
  className,
}: SkeletonRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 bg-surface ring-1 ring-line',
        compact ? 'rounded-md px-3 py-2.5' : 'justify-between rounded-lg p-4',
        className
      )}
    >
      <div className={cn('flex flex-col', compact ? 'flex-1 gap-1.5' : 'gap-2')}>
        <Skeleton className={cn(compact ? 'h-4' : 'h-5', nameWidth ?? 'w-40')} />
        <Skeleton className={cn(compact ? 'h-3.5 w-20' : 'h-3.5 w-32')} />
      </div>
      {badgeWidth && <Skeleton className={cn('h-6 shrink-0 rounded-full', badgeWidth)} />}
    </div>
  )
}
