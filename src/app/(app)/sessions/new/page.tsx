import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { CreateSessionForm } from '@/components/session/create-session-form'
import { getListsWithRestaurantIds } from '@/data-access/lists'
import { searchRestaurants } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { setupHref } from '@/lib/routing'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Nouvelle session' }

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function defaultSessionName(now = new Date()): string {
  const hour = now.getHours()
  const meal = hour < 15 ? 'Déj' : 'Dîner'
  return `${meal} du ${DAY_NAMES[now.getDay()]}`
}

export default async function NewSessionPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(setupHref('/sessions/new'))

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
        back={{ href: '/', label: 'Accueil' }}
      />
      <CreateSessionForm
        lists={lists}
        initialPage={initialPage}
        defaultName={defaultSessionName()}
      />
    </Shell>
  )
}
