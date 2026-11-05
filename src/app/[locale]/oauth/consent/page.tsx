import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import {
  OAuthConsentPanel,
  OAuthConsentPanelFallback,
} from '@/components/account/oauth-consent-panel'
import { Brand } from '@/components/layout/brand'
import { Shell } from '@/components/layout/shell'
import { ThemeToggle } from '@/components/layout/theme-toggle'

import type { Metadata } from 'next'

/**
 * Jamais indexée : la page n'a de sens qu'avec une demande en cours, et
 * `robots.ts` l'exclut déjà de l'exploration.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata.titles')
  return { title: t('oauthConsent'), robots: { index: false, follow: false } }
}

interface Props {
  searchParams: Promise<{ authorization_id?: string | string[] }>
}

/**
 * Consentement OAuth, sur le modèle de `/login` et `/setup` : une barre
 * prérendue, et la demande lue dans un `<Suspense>` (requête et cookies).
 */
export default function OAuthConsentPage({ searchParams }: Props) {
  return (
    <>
      <header className="container-app flex h-14 items-center justify-between lg:h-16">
        <Brand />
        <ThemeToggle />
      </header>
      <Shell className="justify-center gap-8">
        <Suspense fallback={<OAuthConsentPanelFallback />}>
          <OAuthConsentPanel searchParams={searchParams} />
        </Suspense>
      </Shell>
    </>
  )
}
