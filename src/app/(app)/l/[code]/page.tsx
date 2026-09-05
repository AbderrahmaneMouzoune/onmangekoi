import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import { SharedListDetail, SharedListDetailFallback } from '@/components/lists/shared-list-detail'
import { getSharedListPreview } from '@/data-access/lists'
import { createServerClient } from '@/data-access/supabase/server'
import { parseSharedListParam } from '@/domain/share'
import { countLabel, displayPseudo } from '@/lib/format'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ code }, supabase] = await Promise.all([params, createServerClient()])
  const identifier = parseSharedListParam(code)
  if (identifier.kind === 'invalid') return { title: 'Liste partagée' }
  const preview = await getSharedListPreview(supabase, identifier.value).catch(() => null)
  if (!preview) return { title: 'Liste partagée' }
  return {
    title: preview.name,
    description: `${countLabel(preview.restaurant_count, 'resto')} partagés par ${displayPseudo(preview.owner_pseudo)} sur onmangekoi.`,
    robots: { index: false },
  }
}

/**
 * Liste partagée : `/l/7K3M9P2QWX`. Les anciens liens — décorés d'un slug
 * (`/l/restos-du-bureau-7K3M9P2QWX`) ou à jeton 32 hex — restent valides et
 * sont redirigés vers cette forme.
 */
export default function SharedListPage({ params }: Props) {
  return (
    <Shell>
      <Suspense fallback={<SharedListDetailFallback />}>
        <SharedListDetail params={params} />
      </Suspense>
    </Shell>
  )
}
