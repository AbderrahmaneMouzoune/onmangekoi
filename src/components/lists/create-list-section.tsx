import { redirect } from 'next/navigation'

import { CreateListForm } from '@/components/lists/create-list-form'
import { RestaurantPickerFallback } from '@/components/restaurants/restaurant-picker-fallback'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getRestaurantCatalogPage } from '@/data-access/restaurants'
import { cn } from '@/lib/utils'

/**
 * Formulaire de création de liste. Le catalogue vient du cache partagé, mais
 * la garde d'authentification lit les cookies : l'ensemble vit dans le trou
 * dynamique, la coquille de la page étant prérendue.
 */
export async function CreateListSection() {
  const user = await getCurrentUser()
  if (!user) redirect(router.setup(router.listNew()))

  const initialPage = await getRestaurantCatalogPage()

  return <CreateListForm initialPage={initialPage} />
}

/**
 * Silhouette du formulaire : les intitulés et le bouton d'envoi ne dépendent
 * d'aucune donnée — ils sont écrits en clair, dans l'état exact qu'ils auront
 * une fois le formulaire prêt. Seul le catalogue de restos est en attente.
 */
export function CreateListSectionFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm leading-none font-medium text-ink">Nom de la liste</p>
        <Skeleton className="h-12 w-full rounded-md" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Restaurants</p>
        <RestaurantPickerFallback />
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-background/90 px-4 pt-3 pb-3 safe-bottom backdrop-blur-md">
        <button type="button" disabled className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
          Créer la liste vide
        </button>
      </div>
    </div>
  )
}
