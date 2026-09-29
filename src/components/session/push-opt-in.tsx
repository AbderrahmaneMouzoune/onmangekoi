'use client'

import { RiNotification3Line, RiNotificationOffLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'

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
  const t = useTranslations('session.push')

  if (state === 'hidden' || state === 'checking') return null

  return (
    <div className={cn('flex flex-col items-center gap-2 text-center', className)}>
      {state === 'idle' && (
        <Button type="button" variant="outline" onClick={subscribe} disabled={pending}>
          {pending ? <Spinner /> : <RiNotification3Line aria-hidden="true" />}
          {t(`${context}.action`)}
        </Button>
      )}

      {state === 'subscribed' && (
        <>
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <RiNotification3Line aria-hidden="true" className="size-4 shrink-0 text-brand" />
            {t(`${context}.done`)}
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
            {t('stop')}
          </Button>
        </>
      )}

      {state === 'denied' && <p className="text-xs text-muted-foreground">{t('denied')}</p>}

      {state === 'install-first' && (
        <p className="text-xs text-muted-foreground">{t('installFirst')}</p>
      )}

      <FormMessage error={error} />
    </div>
  )
}
