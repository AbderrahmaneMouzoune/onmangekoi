'use client'

import { RiPlayLine } from '@remixicon/react'
import { useState, useTransition } from 'react'

import { ConnectionIndicator } from '@/components/session/connection-indicator'
import { InviteCard } from '@/components/session/invite-card'
import { ParticipantList } from '@/components/session/participant-list'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { TwoStepButton } from '@/components/ui/two-step-button'
import {
  deleteSessionAction,
  launchSessionAction,
  leaveSessionAction,
} from '@/lib/actions/sessions'
import { countLabel, displayPseudo } from '@/lib/format'

import type { ParticipantWithProfile, Session } from '@/data-access/models'
import type { ConnectionState } from '@/hooks/use-session-room'

const MIN_PARTICIPANTS = 2

interface WaitingRoomProps {
  session: Session
  participants: ParticipantWithProfile[]
  meId: string
  isHost: boolean
  inviteUrl: string
  qrSvg: string | null
  restaurantCount: number
  connection: ConnectionState
  onLaunched: (session: Session) => void
}

export function WaitingRoom({
  session,
  participants,
  meId,
  isHost,
  inviteUrl,
  qrSvg,
  restaurantCount,
  connection,
  onLaunched,
}: WaitingRoomProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const host = participants.find((p) => p.profile_id === session.host_id)
  const canLaunch = participants.length >= MIN_PARTICIPANTS

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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {countLabel(restaurantCount, 'resto')} à départager
        </p>
        <ConnectionIndicator state={connection} />
      </div>

      {isHost && (
        <InviteCard
          sessionId={session.id}
          inviteCode={session.invite_code}
          inviteUrl={inviteUrl}
          sessionName={session.name}
          qrSvg={qrSvg}
        />
      )}

      <ParticipantList participants={participants} hostId={session.host_id} meId={meId} />

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
            {canLaunch
              ? 'Une fois lancé, plus personne ne peut rejoindre.'
              : `Il faut au moins ${MIN_PARTICIPANTS} participants pour lancer.`}
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
