import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 rounded-full border border-transparent px-2.5 text-xs font-semibold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5',
  {
    variants: {
      variant: {
        default: 'bg-surface-2 text-ink-2',
        brand: 'bg-brand-soft text-brand-hover',
        outline: 'border-line-strong bg-transparent text-ink-2',
        chalk: 'bg-chalk/15 text-chalk',
        yes: 'bg-yes-soft text-yes',
        fav: 'bg-fav-soft text-fav',
        veto: 'bg-veto-soft text-veto',
        no: 'bg-no-soft text-no',
        live: 'bg-yes-soft text-yes',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function Badge({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
