import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { GroupsOverview, GroupsOverviewFallback } from '@/components/groups/groups-overview'
import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { router } from '@/config/router.config'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata.titles')
  return { title: t('groups') }
}

/** Groupes récurrents : `/groups`. */
export default function GroupsPage() {
  const t = useTranslations('groups.page')
  const tCommon = useTranslations('common')
  return (
    <Shell size="app">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        back={{ href: router.home(), label: tCommon('actions.home') }}
      />

      <Suspense fallback={<GroupsOverviewFallback />}>
        <GroupsOverview />
      </Suspense>
    </Shell>
  )
}
