import { redirect } from 'next/navigation'

import { CreateSessionForm } from '@/components/session/create-session-form'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getListsWithRestaurantIds } from '@/data-access/lists'
import { getRestaurantCatalogPage } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function defaultSessionName(now = new Date()): string {
  const hour = now.getHours()
  const meal = hour < 15 ? 'Déj' : 'Dîner'
  return `${meal} du ${DAY_NAMES[now.getDay()]}`
}

/**
 * Formulaire de création de session. Personnalisé (les listes de la personne)
 * et daté (le nom par défaut dépend de l'heure) : il ne peut pas être prérendu
 * et vit donc dans son `<Suspense>`. Le catalogue de restaurants, lui, sort du
 * cache partagé.
 */
export async function CreateSessionSection() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) redirect(router.setup(router.sessionNew()))

  const [lists, initialPage] = await Promise.all([
    getListsWithRestaurantIds(supabase, user.id),
    getRestaurantCatalogPage(),
  ])

  return (
    <CreateSessionForm lists={lists} initialPage={initialPage} defaultName={defaultSessionName()} />
  )
}

export function CreateSessionSectionFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
