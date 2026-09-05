'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { FinishedPanel } from '@/components/session/finished-panel'
import { SessionStatusBadge } from '@/components/session/session-status-badge'
import { VoteDeck } from '@/components/session/vote-deck'
import { WaitingRoom } from '@/components/session/waiting-room'
import { router } from '@/config/router.config'
import { useSessionRoom } from '@/hooks/use-session-room'

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
