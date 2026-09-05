import { Suspense } from 'react'
import { z } from 'zod'

import { Shell } from '@/components/layout/shell'
import { ListDetail, ListDetailFallback } from '@/components/lists/list-detail'
import { getListWithRestaurants } from '@/data-access/lists'
import { createServerClient } from '@/data-access/supabase/server'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, supabase] = await Promise.all([params, createServerClient()])
  if (!z.uuid().safeParse(id).success) return { title: 'Liste' }
  const list = await getListWithRestaurants(supabase, id).catch(() => null)
  return { title: list?.name ?? 'Liste', robots: { index: false } }
}

export default function ListPage({ params }: Props) {
  return (
    <Shell>
      <Suspense fallback={<ListDetailFallback />}>
        <ListDetail params={params} />
      </Suspense>
    </Shell>
  )
}
