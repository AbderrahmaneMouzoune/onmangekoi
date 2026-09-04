import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { CreateListForm } from '@/components/lists/create-list-form'
import { searchRestaurants } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { setupHref } from '@/lib/routing'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Nouvelle liste' }

export default async function NewListPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(setupHref('/lists/new'))

  const initialPage = await searchRestaurants(supabase)

  return (
    <Shell>
      <PageHeader
        eyebrow="Favoris"
        title="Nouvelle liste"
        description="Nomme-la, puis ajoute tes restos."
        back={{ href: '/lists', label: 'Mes listes' }}
      />
      <CreateListForm initialPage={initialPage} />
    </Shell>
  )
}
