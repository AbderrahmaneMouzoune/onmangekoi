import { notFound, redirect } from 'next/navigation'

import { Shell } from '@/components/layout/shell'
import { SessionRoom } from '@/components/session/session-room'
import {
  getSessionById,
  getSessionParticipants,
  getSessionRestaurants,
} from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { getMyVotes } from '@/data-access/votes'
import { setupHref } from '@/lib/routing'
import { SessionIdSchema } from '@/lib/schemas/session'
import { inviteUrl } from '@/lib/site'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  if (!SessionIdSchema.safeParse(id).success) return { title: 'Session' }
  const supabase = await createServerClient()
  const session = await getSessionById(supabase, id).catch(() => null)
  return { title: session?.name ?? 'Session', robots: { index: false } }
}

export default async function SessionPage({ params }: Props) {
  const { id } = await params
  if (!SessionIdSchema.safeParse(id).success) notFound()

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(setupHref(`/sessions/${id}`))

  // Sous RLS, la session n'est visible que par ses participants :
  // un non-participant obtient null et part sur la page d'invitation.
  const session = await getSessionById(supabase, id)
  if (!session) notFound()

  if (session.status === 'closed') redirect(`/sessions/${id}/results`)

  const [participants, restaurants, votes] = await Promise.all([
    getSessionParticipants(supabase, id),
    getSessionRestaurants(supabase, id),
    getMyVotes(supabase, id),
  ])

  if (!participants.some((p) => p.profile_id === user.id)) {
    redirect(`/join/${session.invite_token}`)
  }

  return (
    <Shell>
      <SessionRoom
        session={session}
        participants={participants}
        restaurants={restaurants}
        myVotedIds={votes.map((vote) => vote.session_restaurant_id)}
        meId={user.id}
        inviteUrl={inviteUrl(session.invite_token)}
      />
    </Shell>
  )
}
