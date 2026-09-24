import { RiGlobalLine, RiGroupLine } from '@remixicon/react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PageHeader, PageHeaderFallback } from '@/components/layout/page-header'
import { ListRestaurantRows } from '@/components/lists/list-restaurant-rows'
import { PublicListDetail, PublicListHighlights } from '@/components/lists/public-list-detail'
import { SharedListActions } from '@/components/lists/shared-list-actions'
import { StartSessionButton } from '@/components/lists/start-session-button'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton, SkeletonRow } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getSharedListPreview, getSharedListRestaurants, ownsSharedList } from '@/data-access/lists'
import { getPublicList } from '@/data-access/public-lists'
import { getRestaurantCatalogPage } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { parseSharedListParam } from '@/domain/share'
import { countLabel, displayPseudo } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Contenu d'une liste partagée, sous deux visages :
 *
 *  * **sans pseudo** — la liste publique se présente d'elle-même
 *    (`PublicListDetail`), lue par le client anonyme et mise en cache ; une
 *    liste restée privée, elle, repart vers l'onboarding comme avant ;
 *  * **avec pseudo** — la page connue de qui reçoit le lien : le contenu, les
 *    actions collaboratives, et la copie dans ses propres listes.
 *
 * Dans les deux cas le code de partage est un secret : sa résolution passe
 * par une RPC `security definer` et ne peut donc jamais être prérendue. Le
 * catalogue du sélecteur, lui, vient du cache partagé.
 */
export async function SharedListDetail({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, user] = await Promise.all([params, getCurrentUser()])
  const identifier = parseSharedListParam(code)
  if (identifier.kind === 'invalid') notFound()

  if (!user) {
    const preview = await getPublicList(identifier.value)
    // Liste privée : rien à montrer à qui n'a pas de pseudo, on l'envoie le
    // choisir et on le ramène ici — le même chemin que `/join/<code>`.
    if (!preview) redirect(router.setup(router.sharedList(code)))

    const canonical = router.sharedList(preview)
    if (`/l/${code}` !== canonical) redirect(canonical)

    return <PublicListDetail preview={preview} setupHref={router.setup(canonical)} />
  }

  const supabase = await createServerClient()

  // Cinq lectures indépendantes en parallèle. La carte de visite publique en
  // fait partie : une liste publique se présente de la même façon à tout le
  // monde, pseudo ou pas. Elle est nulle pour une liste privée.
  const [preview, restaurants, showcase, initialPage, isOwner] = await Promise.all([
    getSharedListPreview(supabase, identifier.value),
    getSharedListRestaurants(supabase, identifier.value),
    getPublicList(identifier.value),
    getRestaurantCatalogPage(),
    ownsSharedList(supabase, identifier),
  ])
  if (!preview) notFound()

  // Forme canonique : le code seul (slug ou ancien token redirigés)
  const canonical = router.sharedList(preview)
  if (`/l/${code}` !== canonical) redirect(canonical)

  // Une liste publique se présente sans son propriétaire, y compris à un
  // visiteur connecté : la page est la même pour tout le monde. Le
  // propriétaire, lui, reste chez lui et voit l'état du partage.
  const showsOwner = isOwner || !preview.is_public

  return (
    <>
      <PageHeader
        eyebrow={showsOwner ? `Liste de ${displayPseudo(preview.owner_pseudo)}` : 'Liste publique'}
        title={preview.name}
        description={countLabel(restaurants.length, 'resto')}
        back={{ href: router.home(), label: 'Accueil' }}
      />

      {/* Sous le titre plutôt qu'à côté : deux pastilles sur un téléphone
          couperaient le nom de la liste en deux lignes. */}
      {(preview.is_collaborative || (isOwner && preview.is_public)) && (
        <div className="flex flex-wrap gap-1.5">
          {isOwner && preview.is_public && (
            <Badge variant="default">
              <RiGlobalLine aria-hidden="true" />
              Publique
            </Badge>
          )}
          {preview.is_collaborative && (
            <Badge variant="brand">
              <RiGroupLine aria-hidden="true" />
              Collaborative
            </Badge>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-10">
        <div className="flex flex-col gap-6">
          {isOwner && (
            <Link
              href={router.list(preview)}
              className={cn(buttonVariants({ variant: 'outline' }), 'lg:self-start')}
            >
              C’est ta liste — la modifier
            </Link>
          )}

          {showcase && <PublicListHighlights preview={showcase} />}

          <ListRestaurantRows restaurants={restaurants} />

          {restaurants.length > 0 && <StartSessionButton identifier={preview.share_code} />}
        </div>

        <SharedListActions
          identifier={preview.share_code}
          isCollaborative={preview.is_collaborative}
          isOwner={isOwner}
          existingIds={restaurants.map((r) => r.id)}
          initialPage={initialPage}
        />
      </div>
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
