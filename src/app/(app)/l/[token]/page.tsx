import { RiGroupLine } from '@remixicon/react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { SharedListActions } from '@/components/lists/shared-list-actions'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { getSharedListPreview, getSharedListRestaurants } from '@/data-access/lists'
import { searchRestaurants } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { countLabel, displayPseudo } from '@/lib/format'
import { setupHref } from '@/lib/routing'
import { cn } from '@/lib/utils'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ token: string }>
}

const TOKEN = /^[a-f0-9]{32}$/i

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  if (!TOKEN.test(token)) return { title: 'Liste partagée' }
  const supabase = await createServerClient()
  const preview = await getSharedListPreview(supabase, token).catch(() => null)
  if (!preview) return { title: 'Liste partagée' }
  return {
    title: preview.name,
    description: `${countLabel(preview.restaurant_count, 'resto')} partagés par ${displayPseudo(preview.owner_pseudo)} sur onmangekoi.`,
    robots: { index: false },
  }
}

export default async function SharedListPage({ params }: Props) {
  const { token } = await params
  if (!TOKEN.test(token)) notFound()

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(setupHref(`/l/${token}`))

  const preview = await getSharedListPreview(supabase, token)
  if (!preview) notFound()

  const [restaurants, initialPage, ownedList] = await Promise.all([
    getSharedListRestaurants(supabase, token),
    searchRestaurants(supabase),
    supabase.from('lists').select('id').eq('id', preview.id).maybeSingle(),
  ])
  const isOwner = Boolean(ownedList.data)

  return (
    <Shell>
      <PageHeader
        eyebrow={`Liste de ${displayPseudo(preview.owner_pseudo)}`}
        title={preview.name}
        description={countLabel(restaurants.length, 'resto')}
        back={{ href: '/', label: 'Accueil' }}
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
        <Link href={`/lists/${preview.id}`} className={cn(buttonVariants({ variant: 'outline' }))}>
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
        token={token}
        isCollaborative={preview.is_collaborative}
        isOwner={isOwner}
        existingIds={restaurants.map((r) => r.id)}
        initialPage={initialPage}
      />
    </Shell>
  )
}
