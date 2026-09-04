'use client'

import { RiErrorWarningLine, RiRefreshLine } from '@remixicon/react'
import Link from 'next/link'
import { useEffect } from 'react'

import { Shell } from '@/components/layout/shell'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Journalisation côté client uniquement ; le message brut n'est jamais affiché.
    console.error(error)
  }, [error])

  return (
    <Shell className="justify-center">
      <EmptyState
        icon={<RiErrorWarningLine />}
        title="Quelque chose a cassé"
        description="Ce n’est pas toi, c’est nous. Réessaie, et si ça persiste reviens à l’accueil."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={reset}>
              <RiRefreshLine aria-hidden="true" />
              Réessayer
            </Button>
            <Link href="/" className={cn(buttonVariants({ variant: 'outline' }))}>
              Accueil
            </Link>
          </div>
        }
      />
      {error.digest && (
        <p className="text-center font-mono text-xs text-faint">Référence : {error.digest}</p>
      )}
    </Shell>
  )
}
