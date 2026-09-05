import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { CreateSessionForm } from '@/components/session/create-session-form'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getListsWithRestaurantIds } from '@/data-access/lists'
import { searchRestaurants } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Nouvelle session' }

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function defaultSessionName(now = new Date()): string {
  const hour = now.getHours()
  const meal = hour < 15 ? 'Déj' : 'Dîner'
  return `${meal} du ${DAY_NAMES[now.getDay()]}`
}

export default async function NewSessionPage() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) redirect(router.setup(router.sessionNew()))

  const [lists, initialPage] = await Promise.all([
    getListsWithRestaurantIds(supabase, user.id),
    searchRestaurants(supabase),
  ])

  return (
    <Shell>
      <PageHeader
        eyebrow="Nouvelle session"
        title="Qui décide ce midi ?"
        description="Choisis les restos à départager, puis invite le groupe."
        back={{ href: router.home(), label: 'Accueil' }}
      />
      <CreateSessionForm
        lists={lists}
        initialPage={initialPage}
        defaultName={defaultSessionName()}
      />
    </Shell>
  )
}
