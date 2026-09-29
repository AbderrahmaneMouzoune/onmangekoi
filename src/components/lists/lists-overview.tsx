import { RiBookmarkLine, RiGroupLine } from '@remixicon/react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'

import { VisitMemo } from '@/components/layout/visit-memo'
import { ArrowKeyList } from '@/components/ui/arrow-key-list'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRow } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getListsByOwner } from '@/data-access/lists'
import { createServerClient } from '@/data-access/supabase/server'
import { relativeDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Listes de la personne connectée : partie personnalisée de `/lists`. */
export async function ListsOverview() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) redirect(router.setup(router.lists()))

  const [lists, locale, t] = await Promise.all([
    getListsByOwner(supabase, user.id),
    getLocale(),
    getTranslations('lists'),
  ])

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
      <ArrowKeyList
        orientation="both"
        aria-label={t('page.title')}
        className="grid gap-2 sm:grid-cols-2 lg:gap-3"
      >
        {lists.map((list) => (
          <li key={list.id}>
            <Link
              href={router.list(list)}
              className="flex items-center justify-between gap-3 rounded-lg bg-surface p-4 ring-1 ring-line transition-colors hover:bg-surface-2"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-semibold">{list.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t('overview.meta', {
                    count: list.restaurant_count,
                    updated: relativeDate(list.updated_at, locale),
                  })}
                </span>
              </div>
              {list.is_collaborative && (
                <Badge variant="brand">
                  <RiGroupLine aria-hidden="true" />
                  {t('overview.collaborative')}
                </Badge>
              )}
            </Link>
          </li>
        ))}
      </ArrowKeyList>
    </>
  )
}

/** Écran vide des listes — partagé avec la silhouette, qui sait déjà le rendre. */
function NoLists() {
  const t = useTranslations('lists.overview.empty')
  return (
    <EmptyState
      icon={<RiBookmarkLine />}
      title={t('title')}
      description={t('description')}
      action={
        <Link href={router.listNew()} className={cn(buttonVariants())}>
          {t('action')}
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
      <div aria-busy="true" className="hidden gap-2 sm:grid-cols-2 lg:gap-3 seen-lists:grid">
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
