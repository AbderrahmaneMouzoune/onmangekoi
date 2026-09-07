'use client'

import { RiEyeLine, RiGlobalLine, RiLockLine } from '@remixicon/react'
import { useState, useTransition } from 'react'

import { setResultsPublicAction } from '@/actions/sessions'
import { ShareResultsButton } from '@/components/session/share-results-button'
import { CopyButton } from '@/components/ui/copy-button'
import { FormMessage } from '@/components/ui/form-message'
import { captureEvent } from '@/lib/analytics/client'
import { cn } from '@/lib/utils'

interface ResultsSharingProps {
  sessionId: string
  sessionName: string
  winnerName: string
  /** Lien réservé aux participants : `/sessions/<code>/results` */
  privateUrl: string
  /** Lien du podium ouvert à tous : `/r/<code>` */
  publicUrl: string
  isHost: boolean
  initialPublic: boolean
}

/**
 * Partage du classement.
 *
 * Deux liens coexistent et ne disent pas la même chose : celui de la salle,
 * qui suppose d'être participant, et celui du podium, que le host ouvre
 * explicitement et qu'on peut coller n'importe où. Seul le host voit la
 * bascule ; les autres partagent ce qui est ouvert.
 */
export function ResultsSharing({
  sessionId,
  sessionName,
  winnerName,
  privateUrl,
  publicUrl,
  isHost,
  initialPublic,
}: ResultsSharingProps) {
  const [isPublic, setIsPublic] = useState(initialPublic)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const shareTitle = `${sessionName} : on mange chez ${winnerName}`

  function toggle() {
    const next = !isPublic
    setError(null)
    setIsPublic(next)
    startTransition(async () => {
      const result = await setResultsPublicAction(sessionId, next)
      if (!result.ok) {
        setIsPublic(!next)
        setError(result.error)
        return
      }
      captureEvent('results_visibility_changed', { session_id: sessionId, is_public: next })
    })
  }

  if (!isHost) {
    return (
      <ShareResultsButton
        url={isPublic ? publicUrl : privateUrl}
        title={shareTitle}
        label="Partager le résultat"
        onShared={() =>
          captureEvent('results_shared', {
            session_id: sessionId,
            method: 'native_share',
            scope: isPublic ? 'public' : 'participants',
          })
        }
      />
    )
  }

  return (
    <section
      aria-labelledby="results-sharing-title"
      className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="results-sharing-title" className="font-display text-base font-semibold">
          Partager les résultats
        </h2>
        <p className="text-sm text-muted-foreground">
          {isPublic
            ? 'Toute personne avec le lien voit le podium et le nombre de participants. Aucun pseudo, aucun détail de vote.'
            : 'Le classement n’est visible que par les participants de la session.'}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        onClick={toggle}
        disabled={isPending}
        className={cn(
          'inline-flex h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors disabled:opacity-50',
          isPublic
            ? 'border-brand bg-brand-soft text-brand-hover'
            : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2'
        )}
      >
        {isPublic ? (
          <RiGlobalLine aria-hidden="true" className="size-4.5" />
        ) : (
          <RiLockLine aria-hidden="true" className="size-4.5" />
        )}
        {isPublic ? 'Lien public actif' : 'Rendre le classement public'}
      </button>

      <FormMessage error={error} />

      <div
        className="flex flex-col gap-2 sm:flex-row"
        data-testid="results-share-actions"
        data-public-url={isPublic ? publicUrl : undefined}
      >
        <ShareResultsButton
          url={isPublic ? publicUrl : privateUrl}
          title={shareTitle}
          label={isPublic ? 'Partager le podium' : 'Partager aux participants'}
          className="sm:flex-1"
          onShared={() =>
            captureEvent('results_shared', {
              session_id: sessionId,
              method: 'native_share',
              scope: isPublic ? 'public' : 'participants',
            })
          }
        />
        {isPublic && (
          <CopyButton
            value={publicUrl}
            label="Copier le lien public"
            variant="outline"
            className="sm:flex-1"
            onCopied={() =>
              captureEvent('results_shared', {
                session_id: sessionId,
                method: 'link_copy',
                scope: 'public',
              })
            }
          />
        )}
      </div>

      {isPublic && (
        <p className="inline-flex items-start gap-1.5 text-xs text-muted-foreground">
          <RiEyeLine aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Refermer le lien le rend inaccessible aussitôt, aperçus compris.
        </p>
      )}
    </section>
  )
}
