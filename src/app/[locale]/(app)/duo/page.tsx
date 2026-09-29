import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { DuoCreateSection, DuoCreateSectionFallback } from '@/components/session/duo-create-section'
import { router } from '@/config/router.config'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata')
  return { title: t('titles.duo'), description: t('duo.description') }
}

/**
 * Mode duo (#61) : choisir les restos, puis envoyer un lien — pas de code à
 * dicter, pas de salle d'attente. La session part aussitôt en vote ; l'écran
 * « Envoie ce lien » est la salle de session elle-même, deck en dessous.
 */
export default function DuoPage() {
  const t = useTranslations('session.duo.page')
  const tCommon = useTranslations('common')
  return (
    <Shell size="app">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        back={{ href: router.home(), label: tCommon('actions.home') }}
      />
      <Suspense fallback={<DuoCreateSectionFallback />}>
        <DuoCreateSection />
      </Suspense>
    </Shell>
  )
}
