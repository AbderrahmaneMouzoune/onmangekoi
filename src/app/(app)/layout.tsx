import { redirect } from 'next/navigation'

import { getProfile } from '@/data-access/profile'
import { createServerClient } from '@/data-access/supabase'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/setup')

  const profile = await getProfile(supabase, user.id)
  if (!profile || profile.pseudo === 'Anonyme') {
    redirect('/setup')
  }

  return <>{children}</>
}
