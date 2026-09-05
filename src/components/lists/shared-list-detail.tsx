import { RiGroupLine } from '@remixicon/react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { SharedListActions } from '@/components/lists/shared-list-actions'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import {
  getOwnedListIdByShare,
  getSharedListPreview,
  getSharedListRestaurants,
} from '@/data-access/lists'
import { getRestaurantCatalogPage } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { parseSharedListParam } from '@/domain/share'
import { countLabel, displayPseudo } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Contenu d'une liste partagée. Le code de partage est un secret : la
 * résolution passe par une RPC `security definer` et ne peut donc jamais être
 * prérendue. Le catalogue du sélecteur, lui, vient du cache partagé.
 */
export async function SharedListDetail({ params }: { params: Promise<{ slug: string }> }) {
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
    getRestaurantCatalogPage(),
    getOwnedListIdByShare(supabase, identifier),
  ])
  if (!preview) notFound()

  // Lien canonique lisible (l'ancien token redirige vers la nouvelle forme)
  const canonical = router.sharedList(preview.share_code, preview.name)
  if (`/l/${slug}` !== canonical) redirect(canonical)

  const isOwner = Boolean(ownedListId)

  return (
    <>
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
    </>
  )
}

export function SharedListDetailFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
      </div>
    </div>
  )
}
