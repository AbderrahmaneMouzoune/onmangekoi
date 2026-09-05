import { RiAddLine, RiBookmarkLine, RiGroupLine } from '@remixicon/react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getListsByOwner } from '@/data-access/lists'
import { createServerClient } from '@/data-access/supabase/server'
import { countLabel, relativeDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mes listes' }

export default async function ListsPage() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) redirect(router.setup(router.lists()))

  const lists = await getListsByOwner(supabase, user.id)

  return (
    <Shell>
      <PageHeader
        eyebrow="Favoris"
        title="Mes listes"
        description="Des restos prêts à importer dans une session."
        back={{ href: router.home(), label: 'Accueil' }}
        action={
          <Link href={router.listNew()} className={cn(buttonVariants({ size: 'sm' }))}>
            <RiAddLine aria-hidden="true" />
            Nouvelle
          </Link>
        }
      />

      {lists.length === 0 ? (
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
      ) : (
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
      )}
    </Shell>
  )
}
