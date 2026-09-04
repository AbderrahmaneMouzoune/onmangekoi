import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { ListEditor } from '@/components/lists/list-editor'
import { getListWithRestaurants } from '@/data-access/lists'
import { searchRestaurants } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { setupHref } from '@/lib/routing'
import { listShareUrl } from '@/lib/site'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return { title: 'Liste' }
  const supabase = await createServerClient()
  const list = await getListWithRestaurants(supabase, id).catch(() => null)
  return { title: list?.name ?? 'Liste', robots: { index: false } }
}

export default async function ListPage({ params }: Props) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(setupHref(`/lists/${id}`))

  const [list, initialPage] = await Promise.all([
    getListWithRestaurants(supabase, id),
    searchRestaurants(supabase),
  ])
  if (!list) notFound()

  return (
    <Shell>
      <PageHeader
        eyebrow="Favoris"
        title={list.name}
        back={{ href: '/lists', label: 'Mes listes' }}
      />
      <ListEditor
        key={list.updated_at}
        list={list}
        initialPage={initialPage}
        shareUrl={listShareUrl(list.share_token)}
      />
    </Shell>
  )
}
