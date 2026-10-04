import { RiAddLine } from '@remixicon/react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata.titles')
  return { title: t('sessions'), robots: { index: false } }
}

interface Props {
  searchParams: Promise<{ cursor?: string }>
}

/** Historique : `/sessions`, page suivante par curseur (`?cursor=…`). */
export default function SessionsPage({ searchParams }: Props) {
  const t = useTranslations('session.history.page')
  const tCommon = useTranslations('common')
  return (
    <Shell>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        back={{ href: router.home(), label: tCommon('actions.home') }}
        action={
          <Link href={router.sessionNew()} className={cn(buttonVariants({ size: 'sm' }))}>
            <RiAddLine aria-hidden="true" />
            {t('new')}
          </Link>
        }
      />

      <Suspense fallback={<SessionHistoryFallback />}>
        <SessionHistorySection searchParams={searchParams} />
      </Suspense>
    </Shell>
  )
}
