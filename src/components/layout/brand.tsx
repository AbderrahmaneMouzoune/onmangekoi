import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { router } from '@/config/router.config'
import { cn } from '@/lib/utils'

interface BrandProps {
  className?: string
  size?: 'sm' | 'lg'
  asLink?: boolean
}

/** La marque ne se traduit pas : « onmange » + « koi », dans toutes les langues. */
const WORDMARK = ['onmange', 'koi'] as const

/** Wordmark : « onmangekoi », le « koi » en tomate, comme la question qu'on se pose. */
export function Brand({ className, size = 'sm', asLink = true }: BrandProps) {
  const t = useTranslations('layout.brand')
  const content = (
    <span
      className={cn(
        'font-display font-extrabold tracking-[-0.04em] text-ink',
        size === 'sm' ? 'text-xl' : 'text-4xl sm:text-5xl',
        className
      )}
    >
      {WORDMARK[0]}
      <span className="text-brand">{WORDMARK[1]}</span>
    </span>
  )

  if (!asLink) return content
  return (
    <Link
      href={router.home()}
      aria-label={t('homeLabel')}
      className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring"
    >
      {content}
    </Link>
  )
}
