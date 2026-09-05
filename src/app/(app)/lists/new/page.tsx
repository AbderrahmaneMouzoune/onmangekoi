import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { CreateListForm } from '@/components/lists/create-list-form'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { searchRestaurants } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Nouvelle liste' }

export default async function NewListPage() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) redirect(router.setup(router.listNew()))

  const initialPage = await searchRestaurants(supabase)

  return (
    <Shell>
      <PageHeader
        eyebrow="Favoris"
        title="Nouvelle liste"
        description="Nomme-la, puis ajoute tes restos."
        back={{ href: router.lists(), label: 'Mes listes' }}
      />
      <CreateListForm initialPage={initialPage} />
    </Shell>
  )
}
