import { notFound, redirect } from 'next/navigation'

import { SessionRoom } from '@/components/session/session-room'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import {
  getSessionByParam,
  getSessionParticipants,
  getSessionRestaurants,
} from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { getMyVotes } from '@/data-access/votes'
import { qrCodeSvg } from '@/lib/qr'
import { inviteUrl } from '@/lib/site'

/** Salon de session : votes et participants, strictement personnel. */
export async function SessionRoomSection({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, supabase, user] = await Promise.all([
    params,
    createServerClient(),
    getCurrentUser(),
  ])
  if (!user) redirect(router.setup(router.session(code)))

  // Résoudre le code coûte une lecture avant les autres, qui ont besoin de l'id.
  // Sous RLS, un non-participant ne voit rien : la session revient nulle.
  const session = await getSessionByParam(supabase, code)
  if (!session) notFound()
  if (session.status === 'closed') redirect(router.sessionResults(session))

  const canonical = router.session(session)
  if (`/sessions/${code}` !== canonical) redirect(canonical)

  // Les trois lectures restantes sont indépendantes : un seul aller-retour.
  const [participants, restaurants, votes] = await Promise.all([
    getSessionParticipants(supabase, session.id),
    getSessionRestaurants(supabase, session.id),
    getMyVotes(supabase, session.id),
  ])

  if (!participants.some((p) => p.profile_id === user.id)) {
    redirect(router.joinInvite(session))
  }

  const url = inviteUrl(session)
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

/**
 * Silhouette du salon — réutilisée telle quelle par `loading.tsx`, pour que la
 * coquille ne bouge pas d'un pixel quand le salon arrive. Le surtitre est le
 * même pour toutes les sessions : il s'affiche en clair, seul le nom attend.
 * La grille est celle du deck de vote, l'écran que la plupart des liens
 * ouvrent : la carte à gauche, les commandes à droite sur grand écran.
 */
export function SessionRoomFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6 lg:gap-8">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="eyebrow">Session</p>
          <Skeleton className="h-8 w-48 sm:h-9 lg:h-10" />
        </div>
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <Skeleton className="mx-auto aspect-[4/5] w-full max-w-lg rounded-xl sm:aspect-[5/6] lg:aspect-[4/5]" />
        <div className="mx-auto flex w-full max-w-lg flex-col gap-5 lg:max-w-none">
          <Skeleton className="h-1.5 w-full rounded-full" />
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
            <Skeleton className="h-20 rounded-lg lg:h-24" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-20 rounded-lg lg:h-24" />
          </div>
        </div>
      </div>
    </div>
  )
}
