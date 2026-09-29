import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

import type { ConnectionState } from '@/hooks/use-session-room'

export function ConnectionIndicator({ state }: { state: ConnectionState }) {
  const t = useTranslations('session.connection')
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] tracking-wide text-muted-foreground uppercase"
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full',
          state === 'live' && 'bg-yes',
          state === 'connecting' && 'animate-pulse bg-fav',
          state === 'offline' && 'bg-veto'
        )}
      />
      {t(state)}
    </span>
  )
}
