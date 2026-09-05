import { notFound, redirect } from 'next/navigation'

import { SessionRoom } from '@/components/session/session-room'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import {
  getSessionById,
  getSessionParticipants,
  getSessionRestaurants,
} from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { getMyVotes } from '@/data-access/votes'
import { qrCodeSvg } from '@/lib/qr'
import { SessionIdSchema } from '@/lib/schemas/session'
import { inviteUrl } from '@/lib/site'

/** Salon de session : votes et participants, strictement personnel. */
export async function SessionRoomSection({ params }: { params: Promise<{ id: string }> }) {
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
    <SessionRoom
      session={session}
      participants={participants}
      restaurants={restaurants}
      myVotedIds={votes.map((vote) => vote.session_restaurant_id)}
      meId={user.id}
      inviteUrl={url}
      qrSvg={qrSvg}
    />
  )
}

/** Même silhouette que `loading.tsx` : la coquille ne bouge pas quand le salon arrive. */
export function SessionRoomFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="aspect-[4/5] w-full rounded-xl sm:aspect-[5/6]" />
      <div className="grid grid-cols-4 gap-2">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </div>
  )
}
