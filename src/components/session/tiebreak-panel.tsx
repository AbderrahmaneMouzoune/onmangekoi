'use client'

import { RiDice5Line, RiRestartLine, RiScales3Line } from '@remixicon/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { createRunoffSessionAction, drawWinnerAction } from '@/actions/sessions'
import { buttonVariants } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { TwoStepButton } from '@/components/ui/two-step-button'
import { router } from '@/config/router.config'
import { joinNames } from '@/domain/tiebreak'
import { useSessionWatch } from '@/hooks/use-session-watch'
import { captureEvent } from '@/lib/analytics/client'
import { cn } from '@/lib/utils'

import type { SessionStatus, TiebreakMethod } from '@/data-access/models'

interface TiebreakPanelProps {
  sessionId: string
  /** Les ex æquo, dans l'ordre du classement */
  tiedNames: string[]
  /** Comment l'égalité a été tranchée, ou `null` tant qu'elle ne l'est pas */
  method: TiebreakMethod | null
  isHost: boolean
  /** Le second tour, dès qu'il existe */
  runoff: { url: string; status: SessionStatus } | null
}

/**
 * Sortie d'une égalité parfaite : le host revote entre les ex æquo, ou laisse
 * le sort trancher. Les deux se décident en base — l'écran ne fait que
 * demander, puis relire.
 *
 * Tant que l'égalité tient, la ligne de session est suivie en direct : le
 * choix du host arrive sur l'écran des autres sans qu'ils rechargent.
 */
export function TiebreakPanel({
  sessionId,
  tiedNames,
  method,
  isHost,
  runoff,
}: TiebreakPanelProps) {
  const navigation = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useSessionWatch(sessionId, method === null)

  const names = joinNames(tiedNames)

  function runSecondRound() {
    setError(null)
    startTransition(async () => {
      const result = await createRunoffSessionAction(sessionId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      captureEvent('session_tiebreak', {
        session_id: sessionId,
        method: 'runoff',
        tied_count: tiedNames.length,
      })
      navigation.push(router.session(result.data))
    })
  }

  function drawLots() {
    setError(null)
    startTransition(async () => {
      const result = await drawWinnerAction(sessionId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      captureEvent('session_tiebreak', {
        session_id: sessionId,
        method: 'draw',
        tied_count: tiedNames.length,
      })
      navigation.refresh()
    })
  }

  return (
    <section
      aria-labelledby="tiebreak-title"
      className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line"
    >
      <div className="flex items-start gap-3">
        <RiScales3Line
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
        />
        <div className="flex flex-col gap-1">
          <h3 id="tiebreak-title" className="font-display text-base font-semibold">
            {method === 'runoff' ? 'Second tour en cours' : 'Égalité parfaite'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {method === 'runoff'
              ? `${names} se départagent dans une nouvelle session : mêmes participants, jokers remis à zéro.`
              : isHost
                ? `${names} terminent au même score, avec autant de coups de cœur. À toi de trancher.`
                : `${names} terminent au même score, avec autant de coups de cœur. Le host va trancher.`}
          </p>
        </div>
      </div>

      {runoff && (
        <Link href={runoff.url} className={cn(buttonVariants(), 'w-full')}>
          {runoff.status === 'closed'
            ? 'Voir le classement du second tour'
            : 'Rejoindre le second tour'}
        </Link>
      )}

      <FormMessage error={error} />

      {isHost && method === null && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <TwoStepButton
            className="flex-1"
            disabled={isPending}
            label={
              <>
                <RiRestartLine aria-hidden="true" />
                Second tour
              </>
            }
            confirmLabel="Confirmer — on revote entre les ex æquo"
            onConfirm={runSecondRound}
          />
          <TwoStepButton
            variant="outline"
            className="flex-1"
            disabled={isPending}
            label={
              <>
                <RiDice5Line aria-hidden="true" />
                Tirage au sort
              </>
            }
            confirmLabel="Confirmer — le sort désigne le gagnant"
            onConfirm={drawLots}
          />
        </div>
      )}
    </section>
  )
}
