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
import { getSharedListPreview, getSharedListRestaurants, ownsSharedList } from '@/data-access/lists'
import { searchRestaurants } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { countLabel, displayPseudo } from '@/lib/format'
import { parseSharedListParam } from '@/lib/share'
import { cn } from '@/lib/utils'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ code }, supabase] = await Promise.all([params, createServerClient()])
  const identifier = parseSharedListParam(code)
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
 * Liste partagée : `/l/7K3M9P2QWX`. Les anciens liens — décorés d'un slug
 * (`/l/restos-du-bureau-7K3M9P2QWX`) ou à jeton 32 hex — restent valides et
 * sont redirigés vers cette forme.
 */
export default async function SharedListPage({ params }: Props) {
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
    searchRestaurants(supabase),
    ownsSharedList(supabase, identifier),
  ])
  if (!preview) notFound()

  // Forme canonique : le code seul (slug ou ancien token redirigés)
  const canonical = router.sharedList(preview)
  if (`/l/${code}` !== canonical) redirect(canonical)

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
    </Shell>
  )
}
