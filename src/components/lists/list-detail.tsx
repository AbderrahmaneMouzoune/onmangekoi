import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'

import { PageHeader } from '@/components/layout/page-header'
import { ListEditor } from '@/components/lists/list-editor'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getListWithRestaurants } from '@/data-access/lists'
import { getRestaurantCatalogPage } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { listShareUrl } from '@/lib/site'

/**
 * Contenu de `/lists/[id]` : identifiant de route + données de la personne
 * connectée, donc entièrement dynamique. Seul le catalogue de restaurants
 * arrive du cache partagé.
 */
export async function ListDetail({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, supabase, user] = await Promise.all([
    params,
    createServerClient(),
    getCurrentUser(),
  ])
  if (!z.uuid().safeParse(id).success) notFound()
  if (!user) redirect(router.setup(router.list(id)))

  const [list, initialPage] = await Promise.all([
    getListWithRestaurants(supabase, id),
    getRestaurantCatalogPage(),
  ])
  if (!list) notFound()

  return (
    <>
      <PageHeader
        eyebrow="Favoris"
        title={list.name}
        back={{ href: router.lists(), label: 'Mes listes' }}
      />
      <ListEditor
        key={list.updated_at}
        list={list}
        initialPage={initialPage}
        shareUrl={listShareUrl(list.share_code, list.name)}
      />
    </>
  )
}

export function ListDetailFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-2/3" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
