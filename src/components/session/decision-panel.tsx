'use client'

import { RiCheckboxCircleLine, RiEditLine, RiRestaurantLine } from '@remixicon/react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { confirmDecisionAction } from '@/actions/sessions'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { captureEvent } from '@/lib/analytics/client'
import { cn } from '@/lib/utils'

import type { DecisionCandidate } from '@/domain/decision'

interface DecisionPanelProps {
  sessionId: string
  /** Les restaurants de la session, dans l'ordre du classement */
  candidates: DecisionCandidate[]
  /** Le restaurant déjà retenu, ou `null` tant que rien n'est confirmé */
  decidedId: string | null
}

/**
 * « On y va » : le host transforme le classement en décision. Le premier du
 * vote est proposé par défaut ; « Choisir un autre resto » ouvre la liste
 * complète, pour un ex æquo ou quand le gagnant a baissé le rideau. Une
 * décision posée se change encore — pas de retour au vote seul.
 *
 * Réservé au host : la section de résultats ne le rend que pour lui, et la
 * base refuse de toute façon quiconque d'autre. Les participants voient la
 * décision arriver dans le classement lui-même, par Realtime.
 */
export function DecisionPanel({ sessionId, candidates, decidedId }: DecisionPanelProps) {
  const navigation = useRouter()
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('session.decision')
  const tCommon = useTranslations('common')

  const leader = candidates[0]
  const decided = candidates.find((candidate) => candidate.restaurantId === decidedId) ?? null
  const [selectedId, setSelectedId] = useState(decided?.restaurantId ?? leader?.restaurantId)

  if (!leader) return null

  const selected = candidates.find((candidate) => candidate.restaurantId === selectedId) ?? leader

  function confirm() {
    setError(null)
    startTransition(async () => {
      const result = await confirmDecisionAction(sessionId, selected.restaurantId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      captureEvent('decision_confirmed', {
        session_id: sessionId,
        rank: selected.rank,
        follows_vote: selected.rank === 1,
        is_change: decided !== null,
      })
      setPicking(false)
      navigation.refresh()
    })
  }

  function openPicker() {
    setSelectedId(decided?.restaurantId ?? leader?.restaurantId)
    setPicking(true)
  }

  return (
    <section
      aria-labelledby="decision-title"
      className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line"
    >
      <div className="flex items-start gap-3">
        {decided ? (
          <RiCheckboxCircleLine aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-yes" />
        ) : (
          <RiRestaurantLine
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id="decision-title" className="font-display text-base font-semibold">
            {decided ? t('decidedTitle') : t('title')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {decided
              ? t('decidedText', { name: decided.name })
              : t('confirmText', { name: selected.name })}
          </p>
        </div>
      </div>

      {picking && (
        <fieldset className="flex flex-col gap-1.5" disabled={isPending}>
          <legend className="mb-1.5 text-sm font-semibold">{t('where')}</legend>
          {candidates.map((candidate) => (
            <label
              key={candidate.restaurantId}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 ring-1 ring-line transition-colors hover:bg-surface-2',
                candidate.restaurantId === selected.restaurantId && 'bg-surface-2 ring-line-strong'
              )}
            >
              <input
                type="radio"
                name={`decision-${sessionId}`}
                value={candidate.restaurantId}
                checked={candidate.restaurantId === selected.restaurantId}
                onChange={() => setSelectedId(candidate.restaurantId)}
                className="size-4 shrink-0 accent-brand"
              />
              <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground tabular">
                {candidate.rank}.
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{candidate.name}</span>
            </label>
          ))}
        </fieldset>
      )}

      <FormMessage error={error} />

      {decided && !picking ? (
        <Button variant="outline" className="w-full sm:w-auto sm:self-start" onClick={openPicker}>
          <RiEditLine aria-hidden="true" />
          {t('change')}
        </Button>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" disabled={isPending} onClick={confirm}>
            <RiCheckboxCircleLine aria-hidden="true" />
            {decided ? t('confirmChoice') : t('go')}
          </Button>
          {picking ? (
            <Button
              variant="ghost"
              className="flex-1"
              disabled={isPending}
              onClick={() => setPicking(false)}
            >
              {tCommon('actions.cancel')}
            </Button>
          ) : (
            candidates.length > 1 && (
              <Button
                variant="outline"
                className="flex-1"
                disabled={isPending}
                onClick={openPicker}
              >
                {t('other')}
              </Button>
            )
          )}
        </div>
      )}
    </section>
  )
}
