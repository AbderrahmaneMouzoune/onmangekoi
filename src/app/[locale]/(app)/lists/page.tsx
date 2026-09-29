import { RiAddLine } from '@remixicon/react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { ListsOverview, ListsOverviewFallback } from '@/components/lists/lists-overview'
import { buttonVariants } from '@/components/ui/button'
import { router } from '@/config/router.config'
import { cn } from '@/lib/utils'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata.titles')
  return { title: t('lists') }
}

export default function ListsPage() {
  const t = useTranslations('lists.page')
  const tCommon = useTranslations('common')
  return (
    <Shell size="app">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        back={{ href: router.home(), label: tCommon('actions.home') }}
        action={
          <Link href={router.listNew()} className={cn(buttonVariants({ size: 'sm' }))}>
            <RiAddLine aria-hidden="true" />
            {t('new')}
          </Link>
        }
      />

      <Suspense fallback={<ListsOverviewFallback />}>
        <ListsOverview />
      </Suspense>
    </Shell>
  )
}
