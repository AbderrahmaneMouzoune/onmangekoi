import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import { SharedListDetail, SharedListDetailFallback } from '@/components/lists/shared-list-detail'
import { getSharedListPreview } from '@/data-access/lists'
import { createServerClient } from '@/data-access/supabase/server'
import { countLabel, displayPseudo } from '@/lib/format'
import { parseSharedListParam } from '@/lib/share'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, supabase] = await Promise.all([params, createServerClient()])
  const identifier = parseSharedListParam(slug)
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
 * Liste partagée : `/l/restos-du-bureau-7K3M9P2QWX`. Le slug est décoratif,
 * seul le code compte ; les anciens liens `/l/<token 32 hex>` restent valides.
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
