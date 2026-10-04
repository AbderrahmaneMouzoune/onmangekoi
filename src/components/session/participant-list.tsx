import { RiCheckDoubleLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { usePeopleLabels } from '@/i18n/use-people-labels'
import { participantLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ParticipantWithProfile } from '@/data-access/models'

interface ParticipantListProps {
  participants: ParticipantWithProfile[]
  /** Null quand le host a supprimé son compte : la session est orpheline. */
  hostId: string | null
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
  const t = useTranslations('session.participants')
  const tCommon = useTranslations('common')
  const people = usePeopleLabels()
  const finished = participants.filter((p) => p.has_finished_voting).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-base font-semibold">
          {tCommon('counts.participants', { count: participants.length })}
        </h2>
        {showProgress && (
          <span className="font-mono text-xs text-muted-foreground tabular">
            {t('finished', { finished, total: participants.length })}
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {participants.map((participant) => {
          const pseudo = participantLabel(
            participant.profile_id,
            participant.profiles?.pseudo,
            people
          )
          const isMe = participant.profile_id === meId
          const isHost = participant.profile_id !== null && participant.profile_id === hostId
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
                {isMe && <span className="ml-1.5 text-xs text-muted-foreground">{t('you')}</span>}
              </span>
              {isHost && <Badge variant="outline">{t('host')}</Badge>}
              {done && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-yes">
                  <RiCheckDoubleLine aria-hidden="true" className="size-4" />
                  {t('done')}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
