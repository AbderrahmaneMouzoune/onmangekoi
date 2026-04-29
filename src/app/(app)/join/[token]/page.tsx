import { redirect } from 'next/navigation'

import { createServerClient } from '@/data-access/supabase'
import { joinSessionUseCase } from '@/use-cases/join-session'

interface Props {
  params: Promise<{ token: string }>
}

/**
 * Route de join direct via le lien d'invitation (invite_token long).
 * Rejoindre est idempotent : si déjà participant, redirige simplement vers la session.
 */
export default async function JoinByTokenPage({ params }: Props) {
  const { token } = await params
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/setup')

  let sessionId: string
  try {
    const { session } = await joinSessionUseCase(user.id, token)
    sessionId = session.id
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lien invalide ou session introuvable'
    redirect(`/join?error=${encodeURIComponent(message)}`)
  }

  redirect(`/sessions/${sessionId}`)
}
