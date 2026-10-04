import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'

import type { SessionStatus } from '@/data-access/models'

const VARIANTS: Record<SessionStatus, 'default' | 'live' | 'brand'> = {
  waiting: 'default',
  voting: 'live',
  closed: 'brand',
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const t = useTranslations('session.status')
  return (
    <Badge variant={VARIANTS[status]}>
      {status === 'voting' && (
        <span aria-hidden="true" className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-yes opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-yes" />
        </span>
      )}
      {t(status)}
    </Badge>
  )
}
