'use client'

import { RiErrorWarningLine, RiRefreshLine } from '@remixicon/react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { Shell } from '@/components/layout/shell'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { router } from '@/config/router.config'
import { captureError } from '@/lib/analytics/client'
import { cn } from '@/lib/utils'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('layout.error')
  const tCommon = useTranslations('common.actions')

  useEffect(() => {
    // Le message brut n'est jamais affiché : il part dans la console et, si la
    // mesure est active, dans l'error tracking (le `digest` relie l'erreur
    // navigateur à sa remontée serveur).
    console.error(error)
    captureError(error, { boundary: 'route', digest: error.digest })
  }, [error])

  return (
    <Shell className="justify-center">
      <EmptyState
        icon={<RiErrorWarningLine />}
        title={t('title')}
        description={t('description')}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={reset}>
              <RiRefreshLine aria-hidden="true" />
              {tCommon('retry')}
            </Button>
            <Link href={router.home()} className={cn(buttonVariants({ variant: 'outline' }))}>
              {tCommon('home')}
            </Link>
          </div>
        }
      />
      {error.digest && (
        <p className="text-center font-mono text-xs text-ink-muted">
          {t('reference', { digest: error.digest })}
        </p>
      )}
    </Shell>
  )
}
