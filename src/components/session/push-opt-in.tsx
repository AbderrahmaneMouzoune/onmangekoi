'use client'

import { RiNotification3Line, RiNotificationOffLine } from '@remixicon/react'

import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { usePushOptIn } from '@/hooks/use-push-opt-in'
import { cn } from '@/lib/utils'

import type { PushOptInContext } from '@/domain/push'

interface PushOptInProps {
  sessionId: string
  /** En salle d'attente (« au lancement ») ou après ses votes (« du résultat »). */
  context: PushOptInContext
  className?: string
}

const COPY: Record<PushOptInContext, { action: string; done: string }> = {
  launch: {
    action: 'Me prévenir au lancement',
    done: 'Ce navigateur te préviendra au lancement du vote, même l’onglet fermé.',
  },
  results: {
    action: 'Me prévenir du résultat',
    done: 'Ce navigateur te préviendra dès que le classement tombe, même l’onglet fermé.',
  },
}

/**
 * « Me prévenir » (issue #7) : une notification quand le vote est lancé ou
 * quand le classement est prêt, pour qui a fermé l'onglet — le Realtime, lui,
 * ne sert que la page ouverte.
 *
 * La permission n'est demandée qu'au clic. L'abonnement est celui du
 * navigateur : une fois pris, il vaut pour toutes les sessions — d'où le
 * libellé qui parle de « ce navigateur ».
 */
export function PushOptIn({ sessionId, context, className }: PushOptInProps) {
  const { state, pending, error, subscribe, unsubscribe } = usePushOptIn({ sessionId, context })
  const copy = COPY[context]

  if (state === 'hidden' || state === 'checking') return null

  return (
    <div className={cn('flex flex-col items-center gap-2 text-center', className)}>
      {state === 'idle' && (
        <Button type="button" variant="outline" onClick={subscribe} disabled={pending}>
          {pending ? <Spinner /> : <RiNotification3Line aria-hidden="true" />}
          {copy.action}
        </Button>
      )}

      {state === 'subscribed' && (
        <>
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <RiNotification3Line aria-hidden="true" className="size-4 shrink-0 text-brand" />
            {copy.done}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={unsubscribe}
            disabled={pending}
          >
            {pending ? <Spinner /> : <RiNotificationOffLine aria-hidden="true" />}
            Ne plus me prévenir
          </Button>
        </>
      )}

      {state === 'denied' && (
        <p className="text-xs text-muted-foreground">
          Les notifications sont bloquées pour onmangekoi : autorise-les dans les réglages du
          navigateur pour recevoir l’alerte.
        </p>
      )}

      {state === 'install-first' && (
        <p className="text-xs text-muted-foreground">
          Sur iPhone, les notifications passent par l’app : ajoute onmangekoi à l’écran d’accueil
          (Partager → Sur l’écran d’accueil), puis ouvre la session depuis l’app.
        </p>
      )}

      <FormMessage error={error} />
    </div>
  )
}
