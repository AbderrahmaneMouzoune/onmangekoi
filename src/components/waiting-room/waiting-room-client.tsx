'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { InviteCard } from '@/components/session/invite-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ParticipantList } from '@/components/waiting-room/participant-list'
import { useWaitingRoom } from '@/hooks/use-waiting-room'
import { launchSessionAction } from '@/lib/actions/sessions'

import type { Session } from '@/data-access/models'
import type { ParticipantWithProfile } from '@/data-access/sessions'

interface Props {
  session: Session
  initialParticipants: ParticipantWithProfile[]
  isHost: boolean
}

const STATUS_LABELS = {
  waiting: "Salle d'attente",
  voting: 'Vote en cours',
  closed: 'Terminée',
} as const

export function WaitingRoomClient({ session, initialParticipants, isHost }: Props) {
  const router = useRouter()
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const { participants, sessionStatus } = useWaitingRoom({
    sessionId: session.id,
    initialParticipants,
    initialStatus: session.status,
  })

  useEffect(() => {
    if (sessionStatus === 'voting') {
      // Vote pas encore implémenté — placeholder
      router.push(`/sessions/${session.id}/vote`)
    }
  }, [sessionStatus, session.id, router])

  function handleLaunch() {
    setLaunchError(null)
    startTransition(async () => {
      const result = await launchSessionAction(session.id)
      if (!result.success) setLaunchError(result.error)
    })
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl leading-tight font-semibold">{session.name}</h1>
        <Badge variant={sessionStatus === 'waiting' ? 'secondary' : 'default'} className="shrink-0">
          {STATUS_LABELS[sessionStatus]}
        </Badge>
      </div>

      {isHost && sessionStatus === 'waiting' && (
        <InviteCard
          inviteToken={session.invite_token}
          inviteCode={session.invite_code}
          sessionName={session.name}
        />
      )}

      <Separator />

      <div className="space-y-3">
        <h2 className="font-medium">Participants</h2>
        <ParticipantList participants={participants} hostId={session.host_id} />
      </div>

      {isHost && sessionStatus === 'waiting' && (
        <div className="space-y-2">
          {launchError && <p className="text-sm text-destructive">{launchError}</p>}
          <Button
            onClick={handleLaunch}
            disabled={isPending || participants.length < 1}
            className="w-full"
          >
            {isPending ? 'Lancement...' : 'Lancer le vote'}
          </Button>
          {participants.length < 2 && (
            <p className="text-center text-xs text-muted-foreground">
              Attends que d&apos;autres personnes rejoignent avant de lancer.
            </p>
          )}
        </div>
      )}

      {!isHost && sessionStatus === 'waiting' && (
        <p className="text-center text-sm text-muted-foreground">
          En attente du lancement par le host…
        </p>
      )}
    </div>
  )
}
