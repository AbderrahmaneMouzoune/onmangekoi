import { Badge } from '@/components/ui/badge'

import type { SessionStatus } from '@/data-access/models'

const LABELS: Record<SessionStatus, { label: string; variant: 'default' | 'live' | 'brand' }> = {
  waiting: { label: 'Salle d’attente', variant: 'default' },
  voting: { label: 'Vote en cours', variant: 'live' },
  closed: { label: 'Terminée', variant: 'brand' },
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const { label, variant } = LABELS[status]
  return (
    <Badge variant={variant}>
      {status === 'voting' && (
        <span aria-hidden="true" className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-yes opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-yes" />
        </span>
      )}
      {label}
    </Badge>
  )
}
