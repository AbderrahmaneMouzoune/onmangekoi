import { redirect } from 'next/navigation'

import { RestaurantPickerFallback } from '@/components/restaurants/restaurant-picker-fallback'
import { DuoCreateForm } from '@/components/session/duo-create-form'
import { buttonVariants } from '@/components/ui/button'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getMyFoodConstraints } from '@/data-access/food-constraints'
import { getListsWithRestaurantIds } from '@/data-access/lists'
import { getRecentWinners } from '@/data-access/recent-winners'
import { getRestaurantCatalogPage } from '@/data-access/restaurants'
import { getRestaurantSuggestions } from '@/data-access/suggestions'
import { createServerClient } from '@/data-access/supabase/server'
import { duoSessionName } from '@/domain/duo'
import { recentWinnerDates } from '@/domain/recent-winners'
import { SUGGESTION_SIZE, toRestaurantSuggestion } from '@/domain/suggestions'
import { cn } from '@/lib/utils'

/**
 * Création d'un duo (#61). Mêmes lectures que le formulaire complet, moins
 * les groupes — on n'invite pas un groupe à deux places. La sélection
 * proposée d'après l'historique (#59) coche d'emblée quelques restos : à
 * deux, on veut partir vite.
 */
export async function DuoCreateSection() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) redirect(router.setup(router.duo()))

  const [lists, initialPage, recentWinners, suggestions, myConstraints] = await Promise.all([
    getListsWithRestaurantIds(supabase, user.id),
    getRestaurantCatalogPage(),
    getRecentWinners(supabase),
    getRestaurantSuggestions(supabase, SUGGESTION_SIZE),
    getMyFoodConstraints(supabase, user.id),
  ])

  return (
    <DuoCreateForm
      lists={lists}
      initialPage={initialPage}
      name={duoSessionName()}
      recentWinners={recentWinnerDates(recentWinners)}
      suggestion={toRestaurantSuggestion(suggestions)}
      myConstraints={myConstraints}
    />
  )
}

/** Silhouette : le titre de l'étape et le bouton sont les mêmes pour tous. */
export function DuoCreateSectionFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold">Les restos à balayer</p>
          <p className="text-sm text-muted-foreground">
            Vous verrez les mêmes, dans le même ordre. Quelques-uns suffisent : on s’arrête au
            premier « ça me va » commun.
          </p>
        </div>
        <RestaurantPickerFallback />
      </section>
      <button
        type="button"
        disabled
        className={cn(buttonVariants({ size: 'lg' }), 'w-full lg:w-auto lg:self-start')}
      >
        Sélectionne des restaurants
      </button>
    </div>
  )
}
