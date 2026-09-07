import { RiArrowLeftLine } from '@remixicon/react'
import Link from 'next/link'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface BackLinkProps {
  href: string
  label: string
}

interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  back?: BackLinkProps
  action?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  eyebrow,
  back,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {back && <BackLink {...back} />}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}

interface PageHeaderFallbackProps {
  /** Surtitre déjà connu au prérendu ; sinon une silhouette (`<Skeleton as="span">`). */
  eyebrow?: React.ReactNode
  back?: BackLinkProps
  /** Largeur approximative du titre à venir. */
  titleWidth?: string
  /** Réserve la ligne de description quand la page en affiche une. */
  description?: boolean
  action?: React.ReactNode
  className?: string
}

/**
 * Silhouette de `PageHeader`. Le retour et le surtitre ne dépendent d'aucune
 * donnée : ils s'affichent en clair — le lien est même cliquable avant la fin
 * du chargement. Seul le titre, lui, reste une barre grise.
 */
export function PageHeaderFallback({
  eyebrow,
  back,
  titleWidth = 'w-2/3',
  description = false,
  action,
  className,
}: PageHeaderFallbackProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {back && <BackLink {...back} />}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <Skeleton className={cn('h-8 sm:h-9', titleWidth)} />
          {description && <Skeleton className="h-5 w-40" />}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}

function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-ink"
    >
      <RiArrowLeftLine aria-hidden="true" className="size-4" />
      {label}
    </Link>
  )
}
