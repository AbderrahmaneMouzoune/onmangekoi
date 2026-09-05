import { Suspense } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import {
  CreateListSection,
  CreateListSectionFallback,
} from '@/components/lists/create-list-section'
import { router } from '@/config/router.config'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Nouvelle liste' }

export default function NewListPage() {
  return (
    <Shell>
      <PageHeader
        eyebrow="Favoris"
        title="Nouvelle liste"
        description="Nomme-la, puis ajoute tes restos."
        back={{ href: router.lists(), label: 'Mes listes' }}
      />
      <Suspense fallback={<CreateListSectionFallback />}>
        <CreateListSection />
      </Suspense>
    </Shell>
  )
}
