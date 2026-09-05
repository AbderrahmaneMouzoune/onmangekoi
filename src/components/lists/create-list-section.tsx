import { redirect } from 'next/navigation'

import { CreateListForm } from '@/components/lists/create-list-form'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getRestaurantCatalogPage } from '@/data-access/restaurants'

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

export function CreateListSectionFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded-md" />
    </div>
  )
}
