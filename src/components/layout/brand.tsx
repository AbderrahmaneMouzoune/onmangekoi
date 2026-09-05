import Link from 'next/link'

import { router } from '@/config/router.config'
import { cn } from '@/lib/utils'

interface BrandProps {
  className?: string
  size?: 'sm' | 'lg'
  asLink?: boolean
}

/** Wordmark : « onmangekoi », le « koi » en tomate, comme la question qu'on se pose. */
export function Brand({ className, size = 'sm', asLink = true }: BrandProps) {
  const content = (
    <span
      className={cn(
        'font-display font-extrabold tracking-[-0.04em] text-ink',
        size === 'sm' ? 'text-xl' : 'text-4xl sm:text-5xl',
        className
      )}
    >
      onmange<span className="text-brand">koi</span>
    </span>
  )

  if (!asLink) return content
  return (
    <Link
      href={router.home()}
      aria-label="onmangekoi, accueil"
      className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      {content}
    </Link>
  )
}
