import { notFound, redirect } from 'next/navigation'

import { PageHeader, PageHeaderFallback } from '@/components/layout/page-header'
import { ListEditor } from '@/components/lists/list-editor'
import { Skeleton, SkeletonRow } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getListByParam } from '@/data-access/lists'
import { getRestaurantCatalogPage } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { listShareUrl } from '@/lib/site'

/**
 * Contenu de `/lists/[code]` : code de route + données de la personne
 * connectée, donc entièrement dynamique. Seul le catalogue de restaurants
 * arrive du cache partagé.
 */
export async function ListDetail({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, supabase, user] = await Promise.all([
    params,
    createServerClient(),
    getCurrentUser(),
  ])
  if (!user) redirect(router.setup(router.list(code)))

  const [list, initialPage] = await Promise.all([
    getListByParam(supabase, code),
    getRestaurantCatalogPage(),
  ])
  if (!list) notFound()

  const canonical = router.list(list)
  if (`/lists/${code}` !== canonical) redirect(canonical)

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
        shareUrl={listShareUrl(list)}
      />
    </>
  )
}

/**
 * Silhouette de l'éditeur de liste. Tout ce que la route porte déjà — le
 * retour vers « Mes listes », le surtitre, les intitulés du formulaire et de
 * la carte de partage — est écrit en clair ; seuls le nom de la liste, son
 * code et ses restos attendent la base.
 */
export function ListDetailFallback() {
  return (
    <>
      <PageHeaderFallback eyebrow="Favoris" back={{ href: router.lists(), label: 'Mes listes' }} />

      <div aria-busy="true" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-none font-medium text-ink">Nom</p>
          <div className="flex gap-2">
            <Skeleton className="h-11 flex-1 rounded-md" />
            <Skeleton className="h-11 w-28 rounded-md" />
          </div>
        </div>

        <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display text-base font-semibold">Partager</h2>
            <Skeleton className="h-5 w-full max-w-xs" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2">
            <span className="font-mono text-[0.68rem] tracking-wide text-muted-foreground uppercase">
              Code
            </span>
            <Skeleton className="h-6 w-36 bg-line" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Skeleton className="h-11 rounded-md sm:flex-1" />
            <Skeleton className="h-11 rounded-md sm:flex-1" />
          </div>
        </section>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
          <div className="flex flex-col gap-1.5">
            <SkeletonRow compact nameWidth="w-40" />
            <SkeletonRow compact nameWidth="w-28" />
            <SkeletonRow compact nameWidth="w-36" />
          </div>
        </div>
      </div>
    </>
  )
}
