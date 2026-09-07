import { RiGroupLine } from '@remixicon/react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PageHeader, PageHeaderFallback } from '@/components/layout/page-header'
import { SharedListActions } from '@/components/lists/shared-list-actions'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton, SkeletonRow } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getSharedListPreview, getSharedListRestaurants, ownsSharedList } from '@/data-access/lists'
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
export async function SharedListDetail({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, supabase, user] = await Promise.all([
    params,
    createServerClient(),
    getCurrentUser(),
  ])
  const identifier = parseSharedListParam(code)
  if (identifier.kind === 'invalid') notFound()
  if (!user) redirect(router.setup(router.sharedList(code)))

  // Quatre lectures indépendantes en parallèle.
  const [preview, restaurants, initialPage, isOwner] = await Promise.all([
    getSharedListPreview(supabase, identifier.value),
    getSharedListRestaurants(supabase, identifier.value),
    getRestaurantCatalogPage(),
    ownsSharedList(supabase, identifier),
  ])
  if (!preview) notFound()

  // Forme canonique : le code seul (slug ou ancien token redirigés)
  const canonical = router.sharedList(preview)
  if (`/l/${code}` !== canonical) redirect(canonical)

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

      {isOwner && (
        <Link href={router.list(preview)} className={cn(buttonVariants({ variant: 'outline' }))}>
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

/**
 * Le code de partage ne dit rien du propriétaire ni du nom : seul le retour
 * vers l'accueil est connu d'avance, et il est affiché comme tel.
 */
export function SharedListDetailFallback() {
  return (
    <>
      <PageHeaderFallback
        eyebrow={<Skeleton as="span" className="h-3 w-32" />}
        back={{ href: router.home(), label: 'Accueil' }}
        description
      />
      <div aria-busy="true" className="flex flex-col gap-1.5">
        <SkeletonRow compact nameWidth="w-44" />
        <SkeletonRow compact nameWidth="w-32" />
        <SkeletonRow compact nameWidth="w-40" />
      </div>
    </>
  )
}
