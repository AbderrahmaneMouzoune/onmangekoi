import { RiCheckDoubleLine } from '@remixicon/react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { countLabel, displayPseudo } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ParticipantWithProfile } from '@/data-access/models'

interface ParticipantListProps {
  participants: ParticipantWithProfile[]
  hostId: string
  meId: string
  /** Affiche l'état « a terminé » (pendant le vote) */
  showProgress?: boolean
}

export function ParticipantList({
  participants,
  hostId,
  meId,
  showProgress = false,
}: ParticipantListProps) {
  const finished = participants.filter((p) => p.has_finished_voting).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-base font-semibold">
          {countLabel(participants.length, 'participant')}
        </h2>
        {showProgress && (
          <span className="font-mono text-xs text-muted-foreground tabular">
            {finished}/{participants.length} ont terminé
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {participants.map((participant) => {
          const pseudo = displayPseudo(participant.profiles?.pseudo)
          const isMe = participant.profile_id === meId
          const isHost = participant.profile_id === hostId
          const done = showProgress && participant.has_finished_voting
          return (
            <li
              key={participant.id}
              className={cn(
                'flex items-center gap-3 rounded-md bg-surface px-3 py-2.5 ring-1 ring-line',
                done && 'ring-yes/40'
              )}
            >
              <Avatar name={pseudo} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {pseudo}
                {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(toi)</span>}
              </span>
              {isHost && <Badge variant="outline">Host</Badge>}
              {done && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-yes">
                  <RiCheckDoubleLine aria-hidden="true" className="size-4" />
                  Terminé
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
