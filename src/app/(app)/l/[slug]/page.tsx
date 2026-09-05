import { RiGroupLine } from '@remixicon/react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { SharedListActions } from '@/components/lists/shared-list-actions'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import {
  getOwnedListIdByShare,
  getSharedListPreview,
  getSharedListRestaurants,
} from '@/data-access/lists'
import { searchRestaurants } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { parseSharedListParam } from '@/domain/share'
import { countLabel, displayPseudo } from '@/lib/format'
import { cn } from '@/lib/utils'

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
export default async function SharedListPage({ params }: Props) {
  const [{ slug }, supabase, user] = await Promise.all([
    params,
    createServerClient(),
    getCurrentUser(),
  ])
  const identifier = parseSharedListParam(slug)
  if (identifier.kind === 'invalid') notFound()
  if (!user) redirect(router.setup(`/l/${slug}`))

  // Quatre lectures indépendantes en parallèle.
  const [preview, restaurants, initialPage, ownedListId] = await Promise.all([
    getSharedListPreview(supabase, identifier.value),
    getSharedListRestaurants(supabase, identifier.value),
    searchRestaurants(supabase),
    getOwnedListIdByShare(supabase, identifier),
  ])
  if (!preview) notFound()

  // Lien canonique lisible (l'ancien token redirige vers la nouvelle forme)
  const canonical = router.sharedList(preview.share_code, preview.name)
  if (`/l/${slug}` !== canonical) redirect(canonical)

  const isOwner = Boolean(ownedListId)

  return (
    <Shell>
      <PageHeader
        eyebrow={`Liste de ${displayPseudo(preview.owner_pseudo)}`}
        title={preview.name}
        description={countLabel(restaurants.length, 'resto')}
        back={{ href: router.home(), label: 'Accueil' }}
        action={
          preview.is_collaborative ? (
            <Badge variant="brand">
              <RiGroupLine aria-hidden="true" />
              Collaborative
            </Badge>
          ) : undefined
        }
      />

      {isOwner && ownedListId && (
        <Link
          href={router.list(ownedListId)}
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          C’est ta liste — la modifier
        </Link>
      )}

      {restaurants.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-muted-foreground">
          Cette liste est encore vide.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {restaurants.map((restaurant) => (
            <li
              key={restaurant.id}
              className="flex items-center gap-3 rounded-md bg-surface px-3 py-2.5 ring-1 ring-line"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{restaurant.name}</span>
                {restaurant.description && (
                  <span className="truncate text-xs text-muted-foreground">
                    {restaurant.description}
                  </span>
                )}
              </div>
              {restaurant.cuisine_type && (
                <span className="shrink-0 font-mono text-[0.68rem] tracking-wide text-muted-foreground uppercase">
                  {restaurant.cuisine_type}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <SharedListActions
        identifier={preview.share_code}
        isCollaborative={preview.is_collaborative}
        isOwner={isOwner}
        existingIds={restaurants.map((r) => r.id)}
        initialPage={initialPage}
      />
    </Shell>
  )
}
