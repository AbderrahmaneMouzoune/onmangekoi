import { RiAddLine } from '@remixicon/react'
import Link from 'next/link'
import { Suspense } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { ListsOverview, ListsOverviewFallback } from '@/components/lists/lists-overview'
import { buttonVariants } from '@/components/ui/button'
import { router } from '@/config/router.config'
import { cn } from '@/lib/utils'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mes listes' }

export default function ListsPage() {
  return (
    <Shell>
      <PageHeader
        eyebrow="Favoris"
        title="Mes listes"
        description="Des restos prêts à importer dans une session."
        back={{ href: router.home(), label: 'Accueil' }}
        action={
          <Link href={router.listNew()} className={cn(buttonVariants({ size: 'sm' }))}>
            <RiAddLine aria-hidden="true" />
            Nouvelle
          </Link>
        }
      />

      <Suspense fallback={<ListsOverviewFallback />}>
        <ListsOverview />
      </Suspense>
    </Shell>
  )
}
