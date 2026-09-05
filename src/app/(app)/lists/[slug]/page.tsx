import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { ListEditor } from '@/components/lists/list-editor'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getListByParam } from '@/data-access/lists'
import { searchRestaurants } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { listShareUrl } from '@/lib/site'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, supabase] = await Promise.all([params, createServerClient()])
  const list = await getListByParam(supabase, slug).catch(() => null)
  return { title: list?.name ?? 'Liste', robots: { index: false } }
}

/**
 * Liste d'un propriétaire : `/lists/restos-du-bureau-7K3M9P2QWX`. Le slug est
 * décoratif, seul le code compte ; les anciens liens en uuid sont redirigés.
 */
export default async function ListPage({ params }: Props) {
  const [{ slug }, supabase, user] = await Promise.all([
    params,
    createServerClient(),
    getCurrentUser(),
  ])
  if (!user) redirect(router.setup(router.list(slug)))

  const [list, initialPage] = await Promise.all([
    getListByParam(supabase, slug),
    searchRestaurants(supabase),
  ])
  if (!list) notFound()

  const canonical = router.list(list)
  if (`/lists/${slug}` !== canonical) redirect(canonical)

  return (
    <Shell>
      <PageHeader
        eyebrow="Favoris"
        title={list.name}
        back={{ href: router.lists(), label: 'Mes listes' }}
      />
      <ListEditor
        key={list.updated_at}
        list={list}
        initialPage={initialPage}
        shareUrl={listShareUrl(list)}
      />
    </Shell>
  )
}
