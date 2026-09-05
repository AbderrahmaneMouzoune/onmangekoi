import { notFound, redirect } from 'next/navigation'

import { Shell } from '@/components/layout/shell'
import { SessionRoom } from '@/components/session/session-room'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import {
  getSessionById,
  getSessionParticipants,
  getSessionRestaurants,
} from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { getMyVotes } from '@/data-access/votes'
import { SessionIdSchema } from '@/domain/schemas/session'
import { qrCodeSvg } from '@/lib/qr'
import { inviteUrl } from '@/lib/site'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, supabase] = await Promise.all([params, createServerClient()])
  if (!SessionIdSchema.safeParse(id).success) return { title: 'Session' }
  const session = await getSessionById(supabase, id).catch(() => null)
  return { title: session?.name ?? 'Session', robots: { index: false } }
}

export default async function SessionPage({ params }: Props) {
  const [{ id }, supabase, user] = await Promise.all([
    params,
    createServerClient(),
    getCurrentUser(),
  ])
  if (!SessionIdSchema.safeParse(id).success) notFound()
  if (!user) redirect(router.setup(router.session(id)))

  // Les quatre lectures sont indépendantes : un seul aller-retour de latence.
  // Sous RLS, un non-participant obtient une session null et repart sur le join.
  const [session, participants, restaurants, votes] = await Promise.all([
    getSessionById(supabase, id),
    getSessionParticipants(supabase, id),
    getSessionRestaurants(supabase, id),
    getMyVotes(supabase, id),
  ])

  if (!session) notFound()
  if (session.status === 'closed') redirect(router.sessionResults(id))
  if (!participants.some((p) => p.profile_id === user.id)) {
    redirect(router.joinInvite(session.invite_token))
  }

  const url = inviteUrl(session.invite_token)
  const isHost = session.host_id === user.id
  const qrSvg = isHost && session.status === 'waiting' ? await qrCodeSvg(url) : null

  return (
    <Shell>
      <SessionRoom
        session={session}
        participants={participants}
        restaurants={restaurants}
        myVotedIds={votes.map((vote) => vote.session_restaurant_id)}
        meId={user.id}
        inviteUrl={url}
        qrSvg={qrSvg}
      />
    </Shell>
  )
}
