import { notFound, redirect } from 'next/navigation'

import { SessionRoom } from '@/components/session/session-room'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getMyGroups, getSessionInvitations } from '@/data-access/groups'
import { getRecentWinners } from '@/data-access/recent-winners'
import { getRestaurantCatalogPage } from '@/data-access/restaurants'
import {
  getSessionById,
  getSessionByParam,
  getSessionParticipants,
  getSessionRestaurants,
} from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { getMyVotes } from '@/data-access/votes'
import { recentWinnerDates } from '@/domain/recent-winners'
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

  // Les lectures restantes sont indépendantes : un seul aller-retour. Les
  // gagnants récents arrivent avec la session, une fois pour tout le deck —
  // aucune carte n'ira les redemander. Le premier tour n'est lu que si cette
  // session en est la suite.
  const [participants, restaurants, votes, recentWinners, firstRound] = await Promise.all([
    getSessionParticipants(supabase, session.id),
    getSessionRestaurants(supabase, session.id),
    getMyVotes(supabase, session.id),
    getRecentWinners(supabase),
    session.parent_session_id ? getSessionById(supabase, session.parent_session_id) : null,
  ])

  if (!participants.some((p) => p.profile_id === user.id)) {
    redirect(router.joinInvite(session))
  }

  // Les jokers se comptent sur les votes eux-mêmes : la base reste seule à
  // décider ce qui reste, le deck n'en affiche que le reflet.
  const jokersUsed = {
    fav: votes.filter((vote) => vote.value === 2).length,
    veto: votes.filter((vote) => vote.value === -2).length,
  }

  const url = inviteUrl(session)
  const waiting = session.status === 'waiting'
  // Pré-inviter un groupe reste la main du host : c'est lui qui compose la
  // salle. Inviter par lien, lui, n'appartient à personne.
  const waitingHost = waiting && session.host_id === user.id

  // Salle d'attente : chacun peut inviter et apporter un resto, donc le QR et
  // le catalogue partent pour tout le monde — jamais pendant le vote, où ils
  // ne serviraient qu'à alourdir la charge utile.
  const [qrSvg, restaurantCatalog, invitations, groups] = await Promise.all([
    waiting ? qrCodeSvg(url) : null,
    waiting ? getRestaurantCatalogPage() : null,
    waitingHost ? getSessionInvitations(supabase, session.id) : [],
    waitingHost ? getMyGroups(supabase) : [],
  ])

  return (
    <SessionRoom
      session={session}
      participants={participants}
      restaurants={restaurants}
      restaurantCatalog={restaurantCatalog}
      myVotedIds={votes.map((vote) => vote.session_restaurant_id)}
      myJokersUsed={jokersUsed}
      recentWinners={recentWinnerDates(recentWinners)}
      meId={user.id}
      inviteUrl={url}
      qrSvg={qrSvg}
      firstRoundUrl={firstRound ? router.sessionResults(firstRound) : null}
      invitations={invitations}
      groups={groups}
    />
  )
}

/**
 * Silhouette du salon — réutilisée telle quelle par `loading.tsx`, pour que la
 * coquille ne bouge pas d'un pixel quand le salon arrive. Le surtitre est le
 * même pour toutes les sessions : il s'affiche en clair, seul le nom attend.
 */
export function SessionRoomFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="eyebrow">Session</p>
          <Skeleton className="h-8 w-48 sm:h-9" />
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
