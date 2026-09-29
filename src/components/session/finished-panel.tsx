'use client'

import { RiCheckDoubleLine, RiFlagLine } from '@remixicon/react'
import { useLocale, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { closeSessionAction } from '@/actions/sessions'
import { ConnectionIndicator } from '@/components/session/connection-indicator'
import { ParticipantList } from '@/components/session/participant-list'
import { PushOptIn } from '@/components/session/push-opt-in'
import { FormMessage } from '@/components/ui/form-message'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { TwoStepButton } from '@/components/ui/two-step-button'
import { duoFinishedState, DUO_SEATS, partnerOf } from '@/domain/duo'
import {
  isDuoSession,
  isOpenSession,
  parseSessionRules,
  requiredFinishers,
} from '@/domain/session-rules'
import { displayPseudo, percentLabel } from '@/lib/format'

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

/**
 * Après ses votes : l'avancée du groupe. Sur grand écran, l'ardoise reste
 * à gauche et les participants défilent à droite, comme en salle d'attente.
 *
 * En session ouverte, il n'y a personne « à attendre » : le nombre de votants
 * n'est pas connu d'avance, d'autres peuvent encore arriver, et seule
 * l'échéance — ou le host — ferme le vote. L'ardoise le dit.
 *
 * En duo (#61), on n'attend qu'une personne, et pas forcément la fin de son
 * deck : son premier « ça me va » à un resto qu'on a aimé suffit. Le compte
 * se fait sur les deux places, même quand la seconde est encore vide.
 */
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
  const t = useTranslations('session.finished')
  const tCommon = useTranslations('common')
  const locale = useLocale()

  const rules = parseSessionRules(session.rules)
  const open = isOpenSession(rules)
  const duo = isDuoSession(rules)
  const finished = participants.filter((p) => p.has_finished_voting).length
  const total = duo ? DUO_SEATS : participants.length
  // Sous 100 %, le classement tombe avant que tout le monde ait voté : annoncer
  // l'attente restante sur l'effectif complet mentirait sur ce qui reste.
  const required = requiredFinishers(total, rules.close_at_ratio)
  const missing = Math.max(0, required - finished)
  const duoState = duo ? duoFinishedState(partnerOf(participants, meId)) : null

  function close() {
    setError(null)
    startTransition(async () => {
      const result = await closeSessionAction(session.id)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start lg:gap-10">
      <div className="flex flex-col gap-6 lg:sticky lg:top-24">
        <div className="flex flex-col items-center gap-3 rounded-lg chalkboard p-6 text-center lg:py-10">
          <span className="flex size-12 items-center justify-center rounded-full bg-chalk/10 text-chalk">
            {meFinished ? (
              <RiCheckDoubleLine aria-hidden="true" className="size-6" />
            ) : (
              <Spinner className="size-6" />
            )}
          </span>
          <h2 className="font-display text-2xl font-bold text-chalk">
            {meFinished ? t('allVoted') : t('inProgress')}
          </h2>
          <p className="text-sm text-chalk-muted">
            {duoState
              ? duoState.kind === 'partnerVoting'
                ? t('duo.partnerVoting', {
                    partner: displayPseudo(duoState.pseudo, tCommon('people.guest')),
                  })
                : t(`duo.${duoState.kind}`)
              : open
                ? t('open')
                : missing === 0
                  ? finished === total
                    ? t('everyoneDone')
                    : t('thresholdReached')
                  : t('waitingFor', { count: missing })}
          </p>
          {!open && !duo && rules.close_at_ratio < 1 && (
            <p className="text-xs text-chalk-muted">
              {t('threshold', {
                ratio: percentLabel(rules.close_at_ratio, locale),
                required,
                total,
              })}
            </p>
          )}
          <div className="flex w-full items-center gap-3 pt-1">
            <Progress
              value={finished}
              max={total}
              tone="chalk"
              label={t('progress')}
              className="flex-1 bg-chalk/15"
            />
            <span className="font-mono text-xs text-chalk-muted tabular">
              {finished}/{total}
            </span>
          </div>
        </div>

        {/* Ses votes faits, rien n'oblige à rester sur la page : le classement
            peut tomber bien plus tard — à l'échéance d'une session ouverte. */}
        {meFinished && <PushOptIn sessionId={session.id} context="results" />}

        {isHost && (
          <div className="flex flex-col gap-2">
            <TwoStepButton
              variant="outline"
              size="lg"
              className="w-full"
              label={
                <>
                  <RiFlagLine aria-hidden="true" />
                  {t('closeNow')}
                </>
              }
              confirmLabel={t('confirmClose')}
              onConfirm={close}
              disabled={isPending}
            />
            <p className="text-center text-xs text-muted-foreground">
              {duo
                ? t('closeHint.duo')
                : open
                  ? t('closeHint.open')
                  : rules.close_at_ratio < 1
                    ? t('closeHint.threshold')
                    : t('closeHint.all')}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
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
      </div>
    </div>
  )
}
