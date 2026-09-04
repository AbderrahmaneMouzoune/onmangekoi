import { RiArrowLeftLine } from '@remixicon/react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  back?: { href: string; label: string }
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
      {back && (
        <Link
          href={back.href}
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-ink"
        >
          <RiArrowLeftLine aria-hidden="true" className="size-4" />
          {back.label}
        </Link>
      )}
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
