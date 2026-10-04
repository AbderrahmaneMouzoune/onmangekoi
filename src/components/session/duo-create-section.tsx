import { redirect } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getFormatter, getTranslations } from 'next-intl/server'

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
import { recentWinnerDates } from '@/domain/recent-winners'
import { mealAt } from '@/domain/session-name'
import { SUGGESTION_SIZE, toRestaurantSuggestion } from '@/domain/suggestions'
import { TIME_ZONE } from '@/i18n/config'
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

  const [lists, initialPage, recentWinners, suggestions, myConstraints, t, format] =
    await Promise.all([
      getListsWithRestaurantIds(supabase, user.id),
      getRestaurantCatalogPage(),
      getRecentWinners(supabase),
      getRestaurantSuggestions(supabase, SUGGESTION_SIZE),
      getMyFoodConstraints(supabase, user.id),
      getTranslations('session.duo'),
      getFormatter(),
    ])

  // Le nom s'écrit dans la langue de qui crée le duo : c'est lui qui le lira
  // dans son historique. L'heure se lit dans le fuseau du produit.
  const now = new Date()
  const name = t('sessionName', {
    meal: mealAt(now, TIME_ZONE),
    day: format.dateTime(now, { weekday: 'long' }),
  })

  return (
    <DuoCreateForm
      lists={lists}
      initialPage={initialPage}
      name={name}
      recentWinners={recentWinnerDates(recentWinners)}
      suggestion={toRestaurantSuggestion(suggestions)}
      myConstraints={myConstraints}
    />
  )
}

/** Silhouette : le titre de l'étape et le bouton sont les mêmes pour tous. */
export function DuoCreateSectionFallback() {
  const t = useTranslations('session.duo.create')
  const tCreate = useTranslations('session.create')
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold">{t('title')}</p>
          <p className="text-sm text-muted-foreground">{t('hint')}</p>
        </div>
        <RestaurantPickerFallback />
      </section>
      <button
        type="button"
        disabled
        className={cn(buttonVariants({ size: 'lg' }), 'w-full lg:w-auto lg:self-start')}
      >
        {tCreate('selectRestaurants')}
      </button>
    </div>
  )
}
