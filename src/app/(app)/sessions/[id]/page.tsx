import { notFound, redirect } from 'next/navigation'

import { WaitingRoomClient } from '@/components/waiting-room/waiting-room-client'
import { getSessionById, getSessionParticipants } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SessionPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/setup')

  const [session, participants] = await Promise.all([
    getSessionById(supabase, id),
    getSessionParticipants(supabase, id),
  ])

  if (!session) notFound()

  // Si l'utilisateur n'est pas encore participant, le rediriger vers le flux de join
  const isParticipant = participants.some((p) => p.profile_id === user.id)
  if (!isParticipant) {
    redirect(`/join/${session.invite_token}`)
  }

  const isHost = session.host_id === user.id

  return <WaitingRoomClient session={session} initialParticipants={participants} isHost={isHost} />
}
