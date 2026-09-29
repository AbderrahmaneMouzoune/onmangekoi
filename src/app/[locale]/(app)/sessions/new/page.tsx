import { RiHeartsLine } from '@remixicon/react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import {
  CreateSessionSection,
  CreateSessionSectionFallback,
} from '@/components/session/create-session-section'
import { router } from '@/config/router.config'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata.titles')
  return { title: t('newSession') }
}

interface NewSessionPageProps {
  /**
   * Filtres du catalogue (`?budget=2&tags=vegan`) : lus dans la section, pas
   * ici, pour que la coquille de la page reste prérendue et que seul le
   * formulaire attende le serveur.
   */
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default function NewSessionPage({ searchParams }: NewSessionPageProps) {
  const t = useTranslations('session.create.page')
  const tCommon = useTranslations('common')
  return (
    <Shell size="app">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        back={{ href: router.home(), label: tCommon('actions.home') }}
        action={
          // À deux, le protocole complet coûte plus cher que la décision :
          // le mode duo (#61) se propose avant qu'on remplisse quoi que ce soit.
          <Link
            href={router.duo()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-sm text-sm font-medium text-brand hover:underline"
          >
            <RiHeartsLine aria-hidden="true" className="size-4" />
            {t('duo')}
          </Link>
        }
      />
      <Suspense fallback={<CreateSessionSectionFallback />}>
        <CreateSessionSection searchParams={searchParams} />
      </Suspense>
    </Shell>
  )
}
