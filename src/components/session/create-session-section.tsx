import { redirect } from 'next/navigation'

import { RestaurantPickerFallback } from '@/components/restaurants/restaurant-picker-fallback'
import { CreateSessionForm } from '@/components/session/create-session-form'
import { DeadlinePickerFallback } from '@/components/session/deadline-picker'
import { SESSION_STEPS, SessionStep, StepTitle } from '@/components/session/session-step'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getMyGroups } from '@/data-access/groups'
import { getListsWithRestaurantIds } from '@/data-access/lists'
import { getRecentWinners } from '@/data-access/recent-winners'
import { getRestaurantCatalogPage } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { recentWinnerDates } from '@/domain/recent-winners'
import { parseRestaurantFilters } from '@/domain/restaurant-filters'
import { cn } from '@/lib/utils'

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function defaultSessionName(now = new Date()): string {
  const hour = now.getHours()
  const meal = hour < 15 ? 'Déj' : 'Dîner'
  return `${meal} du ${DAY_NAMES[now.getDay()]}`
}

interface CreateSessionSectionProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Formulaire de création de session. Personnalisé (les listes et les groupes
 * de la personne) et daté (le nom par défaut dépend de l'heure) : il ne peut
 * pas être prérendu et vit donc dans son `<Suspense>`. Le catalogue de
 * restaurants, lui, sort du cache partagé — filtres compris, puisqu'ils font
 * partie de la clé de cache.
 */
export async function CreateSessionSection({ searchParams }: CreateSessionSectionProps) {
  const [supabase, user, params] = await Promise.all([
    createServerClient(),
    getCurrentUser(),
    searchParams,
  ])
  if (!user) redirect(router.setup(router.sessionNew()))

  const filters = parseRestaurantFilters(params)

  const [lists, groups, initialPage, recentWinners] = await Promise.all([
    getListsWithRestaurantIds(supabase, user.id),
    getMyGroups(supabase),
    // Le rayon reste au vestiaire : le serveur ne connaît pas la position de
    // la personne. Il s'applique dès que le navigateur la donne — d'ici là,
    // un lien partagé avec `?km=1` arrive simplement sans filtre distance.
    getRestaurantCatalogPage({ priceMax: filters.priceMax, tags: filters.tags }),
    getRecentWinners(supabase),
  ])

  return (
    <CreateSessionForm
      lists={lists}
      groups={groups}
      initialPage={initialPage}
      defaultName={defaultSessionName()}
      recentWinners={recentWinnerDates(recentWinners)}
      initialFilters={filters}
    />
  )
}

/**
 * Silhouette du formulaire : les trois étapes et le bouton d'envoi sont les
 * mêmes pour tout le monde, écrits en clair dans leur état de départ. Seuls
 * le nom proposé, les listes de la personne et le catalogue attendent le
 * serveur.
 */
export function CreateSessionSectionFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-8">
      <SessionStep
        number={1}
        title={
          <p className="text-base leading-none font-semibold text-ink">{SESSION_STEPS.name}</p>
        }
      >
        <Skeleton className="h-12 w-full rounded-md" />
      </SessionStep>

      <SessionStep
        number={2}
        title={<p className="text-base font-semibold">{SESSION_STEPS.restaurants}</p>}
        hint={SESSION_STEPS.restaurantsHint}
      >
        <RestaurantPickerFallback />
      </SessionStep>

      <DeadlinePickerFallback
        legend={
          <StepTitle number={3}>
            <span className="text-base font-semibold">{SESSION_STEPS.deadline}</span>
          </StepTitle>
        }
      />

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-background/90 px-4 pt-3 pb-3 safe-bottom backdrop-blur-md">
        <button type="button" disabled className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
          Sélectionne des restaurants
        </button>
      </div>
    </div>
  )
}
