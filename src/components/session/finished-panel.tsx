'use client'

import { RiCheckDoubleLine, RiFlagLine } from '@remixicon/react'
import { useState, useTransition } from 'react'

import { closeSessionAction } from '@/actions/sessions'
import { ConnectionIndicator } from '@/components/session/connection-indicator'
import { ParticipantList } from '@/components/session/participant-list'
import { FormMessage } from '@/components/ui/form-message'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { TwoStepButton } from '@/components/ui/two-step-button'
import { formatRatio, parseSessionRules, requiredFinishers } from '@/domain/session-rules'
import { countLabel } from '@/lib/format'

import type { ParticipantWithProfile, Session } from '@/data-access/models'
import type { ConnectionState } from '@/hooks/use-session-room'

interface FinishedPanelProps {
  session: Session
  participants: ParticipantWithProfile[]
  meId: string
  isHost: boolean
  connection: ConnectionState
  /** L'utilisateur courant a terminé ses votes */
  meFinished: boolean
}

export function FinishedPanel({
  session,
  participants,
  meId,
  isHost,
  connection,
  meFinished,
}: FinishedPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const finished = participants.filter((p) => p.has_finished_voting).length
  const total = participants.length
  // Sous 100 %, le classement tombe avant que tout le monde ait voté : annoncer
  // l'attente restante sur l'effectif complet mentirait sur ce qui reste.
  const rules = parseSessionRules(session.rules)
  const required = requiredFinishers(total, rules.close_at_ratio)
  const missing = Math.max(0, required - finished)

  function close() {
    setError(null)
    startTransition(async () => {
      const result = await closeSessionAction(session.id)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 rounded-lg chalkboard p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-chalk/10 text-chalk">
          {meFinished ? (
            <RiCheckDoubleLine aria-hidden="true" className="size-6" />
          ) : (
            <Spinner className="size-6" />
          )}
        </span>
        <h2 className="font-display text-2xl font-bold text-chalk">
          {meFinished ? 'Tu as tout voté.' : 'Le vote est en cours.'}
        </h2>
        <p className="text-sm text-chalk-muted">
          {missing === 0
            ? finished === total
              ? 'Tout le monde a terminé, le classement arrive.'
              : 'Le seuil de clôture est atteint, le classement arrive.'
            : `On attend ${countLabel(missing, 'personne')}. Le classement s’affichera automatiquement.`}
        </p>
        {rules.close_at_ratio < 1 && (
          <p className="text-xs text-chalk-muted">
            Clôture dès {formatRatio(rules.close_at_ratio)} des participants — soit {required} sur{' '}
            {total}.
          </p>
        )}
        <div className="flex w-full items-center gap-3 pt-1">
          <Progress
            value={finished}
            max={total}
            tone="chalk"
            label="Participants ayant terminé"
            className="flex-1 bg-chalk/15"
          />
          <span className="font-mono text-xs text-chalk-muted tabular">
            {finished}/{total}
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <ConnectionIndicator state={connection} />
      </div>

      <ParticipantList
        participants={participants}
        hostId={session.host_id}
        meId={meId}
        showProgress
      />

      <FormMessage error={error} />

      {isHost && (
        <div className="flex flex-col gap-2">
          <TwoStepButton
            variant="outline"
            size="lg"
            className="w-full"
            label={
              <>
                <RiFlagLine aria-hidden="true" />
                Clôturer maintenant
              </>
            }
            confirmLabel="Confirmer la clôture — les votes manquants comptent 0"
            onConfirm={close}
            disabled={isPending}
          />
          <p className="text-center text-xs text-muted-foreground">
            {rules.close_at_ratio < 1
              ? 'Sinon, la session se clôture toute seule au seuil choisi.'
              : 'Sinon, la session se clôture toute seule quand tout le monde a voté.'}
          </p>
        </div>
      )}
    </div>
  )
}
