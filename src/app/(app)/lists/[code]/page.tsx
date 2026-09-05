import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import { ListDetail, ListDetailFallback } from '@/components/lists/list-detail'
import { getListByParam } from '@/data-access/lists'
import { createServerClient } from '@/data-access/supabase/server'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ code }, supabase] = await Promise.all([params, createServerClient()])
  const list = await getListByParam(supabase, code).catch(() => null)
  return { title: list?.name ?? 'Liste', robots: { index: false } }
}

/**
 * Liste d'un propriétaire : `/lists/7K3M9P2QWX` — le code de partage.
 * Les anciens liens en uuid sont redirigés vers cette forme.
 */
export default function ListPage({ params }: Props) {
  return (
    <Shell>
      <Suspense fallback={<ListDetailFallback />}>
        <ListDetail params={params} />
      </Suspense>
    </Shell>
  )
}
