import { Suspense } from 'react'

import { GroupsOverview, GroupsOverviewFallback } from '@/components/groups/groups-overview'
import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { router } from '@/config/router.config'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mes groupes' }

/** Groupes récurrents : `/groups`. */
export default function GroupsPage() {
  return (
    <Shell size="app">
      <PageHeader
        eyebrow="Groupes"
        title="Mes groupes"
        description="L’équipe du déjeuner, prête à réinviter d’un clic à la prochaine session."
        back={{ href: router.home(), label: 'Accueil' }}
      />

      <Suspense fallback={<GroupsOverviewFallback />}>
        <GroupsOverview />
      </Suspense>
    </Shell>
  )
}
