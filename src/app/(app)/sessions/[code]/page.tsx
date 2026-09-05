import { notFound, redirect } from 'next/navigation'

import { Shell } from '@/components/layout/shell'
import { SessionRoom } from '@/components/session/session-room'
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

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ code }, supabase] = await Promise.all([params, createServerClient()])
  const session = await getSessionByParam(supabase, code).catch(() => null)
  return { title: session?.name ?? 'Session', robots: { index: false } }
}

/**
 * Salle de session : `/sessions/7K3M9P` — le code d'invitation, celui qu'on se
 * dit à voix haute. Les anciens liens en uuid restent valides et sont
 * redirigés vers cette forme.
 */
export default async function SessionPage({ params }: Props) {
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
