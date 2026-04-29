import { redirect } from 'next/navigation'

import { CreateSessionForm } from '@/components/session/create-session-form'
import { getListsByOwner, getRestaurants } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase'

export default async function NewSessionPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Filet de sécurité — normalement garanti par le middleware
  if (!user) redirect('/setup')

  const [lists, restaurants] = await Promise.all([
    getListsByOwner(supabase, user.id),
    getRestaurants(supabase),
  ])

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Nouvelle session</h1>
        <p className="text-sm text-muted-foreground">Configure ta session et invite le groupe.</p>
      </div>
      <CreateSessionForm lists={lists} restaurants={restaurants} />
    </div>
  )
}
