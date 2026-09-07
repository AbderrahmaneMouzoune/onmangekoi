import { RiAddLine } from '@remixicon/react'
import Link from 'next/link'
import { Suspense } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import {
  SessionHistoryFallback,
  SessionHistorySection,
} from '@/components/session/session-history-section'
import { buttonVariants } from '@/components/ui/button'
import { router } from '@/config/router.config'
import { cn } from '@/lib/utils'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mes sessions', robots: { index: false } }

interface Props {
  searchParams: Promise<{ cursor?: string }>
}

/** Historique : `/sessions`, page suivante par curseur (`?cursor=…`). */
export default function SessionsPage({ searchParams }: Props) {
  return (
    <Shell>
      <PageHeader
        eyebrow="Historique"
        title="Mes sessions"
        description="Où on a mangé, et ce que le groupe avait choisi."
        back={{ href: router.home(), label: 'Accueil' }}
        action={
          <Link href={router.sessionNew()} className={cn(buttonVariants({ size: 'sm' }))}>
            <RiAddLine aria-hidden="true" />
            Nouvelle
          </Link>
        }
      />

      <Suspense fallback={<SessionHistoryFallback />}>
        <SessionHistorySection searchParams={searchParams} />
      </Suspense>
    </Shell>
  )
}
