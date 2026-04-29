import { redirect } from 'next/navigation'

import { PseudoForm } from '@/components/pseudo-setup/pseudo-form'
import { getProfile } from '@/data-access/profile'
import { createServerClient } from '@/data-access/supabase'

export default async function SetupPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const profile = await getProfile(supabase, user.id)
  if (profile && profile.pseudo !== 'Anonyme') {
    redirect('/sessions/new')
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <div className="text-4xl">🍴</div>
          <h1 className="text-2xl font-bold">Bienvenue</h1>
          <p className="text-sm text-muted-foreground">
            Choisis un pseudo pour rejoindre ou créer une session.
          </p>
        </div>
        <PseudoForm />
      </div>
    </div>
  )
}
