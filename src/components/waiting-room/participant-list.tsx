import { Badge } from '@/components/ui/badge'

import type { ParticipantWithProfile } from '@/data-access/sessions'

interface Props {
  participants: ParticipantWithProfile[]
  hostId: string
}

export function ParticipantList({ participants, hostId }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {participants.length} participant{participants.length > 1 ? 's' : ''}
      </p>
      <ul className="space-y-2">
        {participants.map((p) => (
          <li key={p.id} className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {p.profiles.pseudo[0].toUpperCase()}
            </div>
            <span className="font-medium">{p.profiles.pseudo}</span>
            {p.profile_id === hostId && (
              <Badge variant="secondary" className="ml-auto text-xs">
                Host
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
