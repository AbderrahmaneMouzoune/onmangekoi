'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { FinishedPanel } from '@/components/session/finished-panel'
import { SessionStatusBadge } from '@/components/session/session-status-badge'
import { VoteDeck } from '@/components/session/vote-deck'
import { WaitingRoom } from '@/components/session/waiting-room'
import { router } from '@/config/router.config'
import { useSessionRoom } from '@/hooks/use-session-room'
import { captureEvent } from '@/lib/analytics/client'
import { markOnce, takeSessionEntry } from '@/lib/analytics/handoff'

import type {
  ParticipantWithProfile,
  Session,
  SessionRestaurantWithRestaurant,
} from '@/data-access/models'

interface SessionRoomProps {
  session: Session
  participants: ParticipantWithProfile[]
  restaurants: SessionRestaurantWithRestaurant[]
  myVotedIds: string[]
  meId: string
  inviteUrl: string
  /** QR code SVG du lien d'invitation, rendu côté serveur (host, salle d'attente) */
  qrSvg: string | null
}

/**
 * Orchestre l'écran de session selon son statut, en temps réel :
 *  waiting → salle d'attente · voting → deck (ou attente des autres) · closed → résultats.
 */
export function SessionRoom({
  session: initialSession,
  participants: initialParticipants,
  restaurants,
  myVotedIds,
  meId,
  inviteUrl,
  qrSvg,
}: SessionRoomProps) {
  const navigation = useRouter()
  const { session, participants, connection, refresh, setSession } = useSessionRoom({
    sessionId: initialSession.id,
    initialSession,
    initialParticipants,
  })

  const me = participants.find((p) => p.profile_id === meId)
  const isHost = session.host_id === meId

  const [finishedLocally, setFinishedLocally] = useState(
    myVotedIds.length >= restaurants.length && restaurants.length > 0
  )
  const meFinished = finishedLocally || Boolean(me?.has_finished_voting)

  // Entrée en session : l'intention posée avant le redirect serveur dit d'où
  // vient la personne. Sans intention, c'est un lien d'invitation ouvert
  // directement — sauf pour le host, qui ne « rejoint » pas sa propre session.
  useEffect(() => {
    if (!markOnce(`entry.${initialSession.id}`)) return

    const entry = takeSessionEntry()
    if (entry?.kind === 'created') {
      captureEvent('session_created', {
        session_id: initialSession.id,
        restaurant_count: restaurants.length,
        list_count: entry.listCount,
      })
      return
    }

    const via = entry?.kind === 'joined' ? entry.via : 'link'
    if (entry || !isHost) {
      captureEvent('session_joined', { session_id: initialSession.id, via })
    }
  }, [initialSession.id, isHost, restaurants.length])

  const closeTracked = useRef(false)

  useEffect(() => {
    if (session.status !== 'closed' || closeTracked.current) return
    closeTracked.current = true

    // Personne n'annonce la clôture : elle vient de la base dès que tout le
    // monde a fini, sinon c'est le host qui l'a forcée.
    const everyoneFinished =
      participants.length > 0 && participants.every((p) => p.has_finished_voting)
    captureEvent('session_closed', {
      session_id: session.id,
      reason: everyoneFinished ? 'auto' : 'host',
      participant_count: participants.length,
      restaurant_count: restaurants.length,
    })
  }, [session.status, session.id, participants, restaurants.length])

  useEffect(() => {
    if (session.status === 'closed') {
      navigation.replace(router.sessionResults(session.id))
    }
  }, [session.status, session.id, navigation])

  const handleFinished = useCallback(() => {
    setFinishedLocally(true)
    void refresh()
  }, [refresh])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="eyebrow">Session</p>
          <h1 className="truncate text-2xl font-bold sm:text-3xl">{session.name}</h1>
        </div>
        <SessionStatusBadge status={session.status} />
      </div>

      {session.status === 'waiting' && (
        <WaitingRoom
          session={session}
          participants={participants}
          meId={meId}
          isHost={isHost}
          inviteUrl={inviteUrl}
          qrSvg={qrSvg}
          restaurantCount={restaurants.length}
          connection={connection}
          onLaunched={setSession}
        />
      )}

      {session.status === 'voting' && !meFinished && (
        <VoteDeck
          sessionId={session.id}
          restaurants={restaurants}
          initialVotedIds={myVotedIds}
          initialSuperlikeUsed={me?.superlike_used ?? false}
          initialSuperDislikeUsed={me?.super_dislike_used ?? false}
          onFinished={handleFinished}
        />
      )}

      {session.status === 'voting' && meFinished && (
        <FinishedPanel
          session={session}
          participants={participants}
          meId={meId}
          isHost={isHost}
          connection={connection}
          meFinished
        />
      )}

      {session.status === 'closed' && (
        <p className="text-center text-sm text-muted-foreground">Ouverture du classement…</p>
      )}
    </div>
  )
}
