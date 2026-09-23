'use client'

import { RiPlayLine } from '@remixicon/react'
import { useState, useTransition } from 'react'

import { deleteSessionAction, launchSessionAction, leaveSessionAction } from '@/actions/sessions'
import { ConnectionIndicator } from '@/components/session/connection-indicator'
import { InviteCard } from '@/components/session/invite-card'
import { ParticipantList } from '@/components/session/participant-list'
import { PendingInvitees } from '@/components/session/pending-invitees'
import { SessionRestaurantsPanel } from '@/components/session/session-restaurants-panel'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { TwoStepButton } from '@/components/ui/two-step-button'
import { displayPseudo } from '@/lib/format'

import type {
  GroupWithMembers,
  InvitationWithProfile,
  ParticipantWithProfile,
  Session,
  SessionRestaurantWithRestaurant,
} from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'
import type { ConnectionState } from '@/hooks/use-session-room'

const MIN_PARTICIPANTS = 2
/** Un seul resto ne se départage pas : le vote n'aurait rien à trancher. */
const MIN_RESTAURANTS = 2

interface WaitingRoomProps {
  session: Session
  participants: ParticipantWithProfile[]
  meId: string
  isHost: boolean
  inviteUrl: string
  qrSvg: string | null
  restaurants: SessionRestaurantWithRestaurant[]
  /** Première page du catalogue, pour le sélecteur de restaurants */
  restaurantCatalog: RestaurantPage | null
  connection: ConnectionState
  /** Invités pré-ajoutés qui n'ont pas encore ouvert la session (host). */
  invitations: InvitationWithProfile[]
  /** Groupes du host, pour en inviter un depuis la salle d'attente. */
  groups: GroupWithMembers[]
  onLaunched: (session: Session) => void
  /** Resynchronise la salle après un ajout ou un retrait de restaurant */
  onRestaurantsChanged: () => void
}

export function WaitingRoom({
  session,
  participants,
  meId,
  isHost,
  inviteUrl,
  qrSvg,
  restaurants,
  restaurantCatalog,
  connection,
  invitations,
  groups,
  onLaunched,
  onRestaurantsChanged,
}: WaitingRoomProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const host = participants.find(
    (p) => session.host_id !== null && p.profile_id === session.host_id
  )
  const missingParticipants = participants.length < MIN_PARTICIPANTS
  const missingRestaurants = restaurants.length < MIN_RESTAURANTS
  const canLaunch = !missingParticipants && !missingRestaurants

  function launch() {
    setError(null)
    startTransition(async () => {
      const result = await launchSessionAction(session.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onLaunched(result.data)
    })
  }

  function leave() {
    startTransition(async () => {
      const result = await leaveSessionAction(session.id)
      if (!result.ok) setError(result.error)
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteSessionAction(session.id)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <ConnectionIndicator state={connection} />
      </div>

      {/* Inviter n'est pas un privilège de host : tout le monde peut faire venir
          du monde, comme tout le monde peut apporter un resto. */}
      <InviteCard
        sessionId={session.id}
        inviteCode={session.invite_code}
        inviteUrl={inviteUrl}
        sessionName={session.name}
        qrSvg={qrSvg}
      />

      <SessionRestaurantsPanel
        sessionId={session.id}
        restaurants={restaurants}
        participants={participants}
        meId={meId}
        isHost={isHost}
        initialPage={restaurantCatalog}
        onChanged={onRestaurantsChanged}
      />

      <ParticipantList participants={participants} hostId={session.host_id} meId={meId} />

      {isHost && (
        <PendingInvitees
          sessionId={session.id}
          invitations={invitations}
          groups={groups}
          arrivedIds={participants
            .map((participant) => participant.profile_id)
            .filter((id): id is string => id !== null)}
        />
      )}

      <FormMessage error={error} />

      {isHost ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            onClick={launch}
            disabled={isPending || !canLaunch}
            className="w-full"
          >
            {isPending ? <Spinner /> : <RiPlayLine aria-hidden="true" />}
            Lancer le vote
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {launchHint({ missingParticipants, missingRestaurants })}
          </p>
          <TwoStepButton
            variant="ghost"
            size="sm"
            className="mt-2 self-center text-muted-foreground hover:text-veto"
            label="Supprimer la session"
            confirmLabel="Confirmer la suppression"
            onConfirm={remove}
            disabled={isPending}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            En attente du lancement par {displayPseudo(host?.profiles?.pseudo)}…
          </p>
          <TwoStepButton
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-veto"
            label="Quitter la session"
            confirmLabel="Confirmer"
            onConfirm={leave}
            disabled={isPending}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Ce qui manque pour lancer, dit en une phrase — et ce que lancer implique
 * quand plus rien ne manque.
 */
function launchHint({
  missingParticipants,
  missingRestaurants,
}: {
  missingParticipants: boolean
  missingRestaurants: boolean
}): string {
  if (missingParticipants && missingRestaurants) {
    return `Il faut au moins ${MIN_PARTICIPANTS} participants et ${MIN_RESTAURANTS} restos pour lancer.`
  }
  if (missingParticipants) {
    return `Il faut au moins ${MIN_PARTICIPANTS} participants pour lancer.`
  }
  if (missingRestaurants) {
    return 'Avec un seul resto, il n’y a rien à départager : chacun peut apporter le sien.'
  }
  return 'Une fois lancé, plus personne ne peut rejoindre.'
}
