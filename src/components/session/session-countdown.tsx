'use client'

import { RiTimerLine } from '@remixicon/react'
import { useEffect, useRef, useState, useTransition } from 'react'

import { extendSessionAction } from '@/actions/sessions'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { EXTEND_MINUTES, formatCountdown, formatDeadlineTime } from '@/domain/session-deadline'
import { useCountdown } from '@/hooks/use-countdown'
import { cn } from '@/lib/utils'

import type { Session } from '@/data-access/models'

interface SessionCountdownProps {
  session: Session
  isHost: boolean
  /** Session mise à jour après une prolongation (Realtime la confirmera aussi). */
  onExtended: (session: Session) => void
  /** L'échéance vient d'être atteinte : le salon va rechercher le statut. */
  onExpired: () => void
}

/** En dessous, le compte à rebours passe en alerte. */
const URGENT_MS = 60_000

/**
 * Échéance d'une session chronométrée : le temps restant, et pour le host de
 * quoi se donner cinq minutes de plus. Rien n'est rendu sans échéance — une
 * session ordinaire reste exactement ce qu'elle était.
 */
export function SessionCountdown({
  session,
  isHost,
  onExtended,
  onExpired,
}: SessionCountdownProps) {
  const remaining = useCountdown(session.closes_at)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const expiredFor = useRef<string | null>(null)

  const expired = remaining === 0

  useEffect(() => {
    if (!expired || !session.closes_at || expiredFor.current === session.closes_at) return
    expiredFor.current = session.closes_at
    onExpired()
  }, [expired, session.closes_at, onExpired])

  // Rien à afficher avant le montage : l'heure de clôture dépend du fuseau du
  // visiteur, que le rendu serveur ne connaît pas.
  if (!session.closes_at || remaining === null) return null

  const voting = session.status === 'voting'
  const label = voting ? 'Clôture automatique' : 'Vote à lancer avant'

  function extend() {
    setError(null)
    startTransition(async () => {
      const result = await extendSessionAction(session.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onExtended(result.data)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5',
          expired || remaining <= URGENT_MS
            ? 'border-veto/40 bg-veto-soft text-veto'
            : 'border-line bg-surface text-ink-2'
        )}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <RiTimerLine aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">
            {label} {formatDeadlineTime(session.closes_at)}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <span role="timer" aria-live="off" className="font-mono text-sm font-semibold tabular">
            {expired ? (voting ? 'Clôture…' : 'Dépassée') : formatCountdown(remaining)}
          </span>
          {isHost && (
            <Button type="button" variant="outline" size="sm" onClick={extend} disabled={isPending}>
              +{EXTEND_MINUTES} min
            </Button>
          )}
        </span>
      </div>

      <FormMessage error={error} />
    </div>
  )
}
