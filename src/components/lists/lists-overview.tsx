import { RiBookmarkLine, RiGroupLine } from '@remixicon/react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { VisitMemo } from '@/components/layout/visit-memo'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRow } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getListsByOwner } from '@/data-access/lists'
import { createServerClient } from '@/data-access/supabase/server'
import { countLabel, relativeDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Listes de la personne connectée : partie personnalisée de `/lists`. */
export async function ListsOverview() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) redirect(router.setup(router.lists()))

  const lists = await getListsByOwner(supabase, user.id)

  if (lists.length === 0) {
    return (
      <>
        <VisitMemo account lists={false} />
        <NoLists />
      </>
    )
  }

  return (
    <>
      <VisitMemo account lists />
      <ul className="flex flex-col gap-2">
        {lists.map((list) => (
          <li key={list.id}>
            <Link
              href={router.list(list)}
              className="flex items-center justify-between gap-3 rounded-lg bg-surface p-4 ring-1 ring-line transition-colors hover:bg-surface-2"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-semibold">{list.name}</span>
                <span className="text-xs text-muted-foreground">
                  {countLabel(list.restaurant_count, 'resto')} · modifiée{' '}
                  {relativeDate(list.updated_at)}
                </span>
              </div>
              {list.is_collaborative && (
                <Badge variant="brand">
                  <RiGroupLine aria-hidden="true" />
                  Collaborative
                </Badge>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Écran vide des listes — partagé avec la silhouette, qui sait déjà le rendre. */
function NoLists() {
  return (
    <EmptyState
      icon={<RiBookmarkLine />}
      title="Aucune liste pour l’instant"
      description="Regroupe les restos du bureau, du quartier, du vendredi soir… et importe-les en un clic."
      action={
        <Link href={router.listNew()} className={cn(buttonVariants())}>
          Créer ma première liste
        </Link>
      }
    />
  )
}

/**
 * Silhouette accordée à la dernière visite : des rangées pour qui avait des
 * listes, l'écran vide — déjà le bon — pour qui n'en avait pas, et rien du
 * tout pour un premier passage, que `/lists` renvoie de toute façon vers
 * l'onboarding.
 */
export function ListsOverviewFallback() {
  return (
    <>
      <div aria-busy="true" className="hidden flex-col gap-2 seen-lists:flex">
        <SkeletonRow nameWidth="w-44" />
        <SkeletonRow nameWidth="w-32" badgeWidth="w-32" />
        <SkeletonRow nameWidth="w-40" />
      </div>
      <div className="hidden seen-no-lists:block">
        <NoLists />
      </div>
    </>
  )
}
