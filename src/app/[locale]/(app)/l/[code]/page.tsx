import { getLocale, getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import { SharedListDetail, SharedListDetailFallback } from '@/components/lists/shared-list-detail'
import { router } from '@/config/router.config'
import { getSharedListPreview } from '@/data-access/lists'
import { getPublicList } from '@/data-access/public-lists'
import { createServerClient } from '@/data-access/supabase/server'
import { parseSharedListParam } from '@/domain/share'
import { joinNames } from '@/domain/tiebreak'
import { displayPseudo } from '@/lib/format'
import { absoluteUrl } from '@/lib/site'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ code }, t, tTitles, tCommon, locale] = await Promise.all([
    params,
    getTranslations('metadata.sharedList'),
    getTranslations('metadata.titles'),
    getTranslations('common'),
    getLocale(),
  ])
  const identifier = parseSharedListParam(code)
  if (identifier.kind === 'invalid') return { title: tTitles('sharedList') }

  // Liste publique : la page est faite pour être trouvée et dépliée dans une
  // conversation. Rien du propriétaire n'entre dans ces métadonnées — la RPC
  // publique n'en rend rien.
  const publicPreview = await getPublicList(identifier.value).catch(() => null)
  if (publicPreview) {
    const cuisines = publicPreview.cuisines.slice(0, 3)
    const url = absoluteUrl(router.sharedList(publicPreview))
    const count = publicPreview.restaurant_count
    const description =
      cuisines.length > 0
        ? t('publicDescriptionWithCuisines', { count, cuisines: joinNames(cuisines, locale) })
        : t('publicDescription', { count })

    return {
      title: publicPreview.name,
      description,
      alternates: { canonical: url },
      openGraph: { title: publicPreview.name, description, url },
    }
  }

  // Liste privée : l'aperçu reste réservé à qui a le lien, et la page sort de
  // l'index — c'est le partage par lien d'avant, inchangé.
  const supabase = await createServerClient()
  const preview = await getSharedListPreview(supabase, identifier.value).catch(() => null)
  if (!preview) return { title: tTitles('sharedList') }
  return {
    title: preview.name,
    description: t('privateDescription', {
      count: preview.restaurant_count,
      owner: displayPseudo(preview.owner_pseudo, tCommon('people.guest')),
    }),
    robots: { index: false },
  }
}

/**
 * Liste partagée : `/l/7K3M9P2QWX`. Publique, elle se présente à tout le
 * monde ; privée, elle reste réservée à qui a le lien et à son pseudo. Les
 * anciens liens — décorés d'un slug (`/l/restos-du-bureau-7K3M9P2QWX`) ou à
 * jeton 32 hex — restent valides et sont redirigés vers cette forme.
 */
export default function SharedListPage({ params }: Props) {
  return (
    <Shell size="app">
      <Suspense fallback={<SharedListDetailFallback />}>
        <SharedListDetail params={params} />
      </Suspense>
    </Shell>
  )
}
