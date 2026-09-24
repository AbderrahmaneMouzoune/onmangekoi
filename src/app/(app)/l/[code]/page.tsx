import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import { SharedListDetail, SharedListDetailFallback } from '@/components/lists/shared-list-detail'
import { router } from '@/config/router.config'
import { getSharedListPreview } from '@/data-access/lists'
import { getPublicList } from '@/data-access/public-lists'
import { createServerClient } from '@/data-access/supabase/server'
import { parseSharedListParam } from '@/domain/share'
import { countLabel, displayPseudo } from '@/lib/format'
import { absoluteUrl } from '@/lib/site'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  const identifier = parseSharedListParam(code)
  if (identifier.kind === 'invalid') return { title: 'Liste partagée' }

  // Liste publique : la page est faite pour être trouvée et dépliée dans une
  // conversation. Rien du propriétaire n'entre dans ces métadonnées — la RPC
  // publique n'en rend rien.
  const publicPreview = await getPublicList(identifier.value).catch(() => null)
  if (publicPreview) {
    const cuisines = publicPreview.cuisines.slice(0, 3).join(', ')
    const url = absoluteUrl(router.sharedList(publicPreview))
    const description = `${countLabel(publicPreview.restaurant_count, 'resto')} à se partager${
      cuisines ? ` — ${cuisines}` : ''
    }. Lance un vote depuis cette liste, sans compte.`

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
  if (!preview) return { title: 'Liste partagée' }
  return {
    title: preview.name,
    description: `${countLabel(preview.restaurant_count, 'resto')} partagés par ${displayPseudo(preview.owner_pseudo)} sur onmangekoi.`,
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
