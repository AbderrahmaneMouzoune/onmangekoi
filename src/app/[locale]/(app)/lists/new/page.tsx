import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import {
  CreateListSection,
  CreateListSectionFallback,
} from '@/components/lists/create-list-section'
import { router } from '@/config/router.config'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata.titles')
  return { title: t('newList') }
}

export default function NewListPage() {
  const t = useTranslations('lists')
  return (
    <Shell size="app">
      <PageHeader
        eyebrow={t('page.eyebrow')}
        title={t('newPage.title')}
        description={t('newPage.description')}
        back={{ href: router.lists(), label: t('page.title') }}
      />
      <Suspense fallback={<CreateListSectionFallback />}>
        <CreateListSection />
      </Suspense>
    </Shell>
  )
}
