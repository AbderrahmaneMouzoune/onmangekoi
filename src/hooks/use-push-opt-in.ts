'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState, useTransition } from 'react'

import { subscribePushAction, unsubscribePushAction } from '@/actions/push'
import { env } from '@/env'
import { captureEvent } from '@/lib/analytics/client'
import {
  currentPushSubscription,
  isAppleMobile,
  pushPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/pwa/push-subscription'
import { isServiceWorkerEnabled } from '@/lib/pwa/registration'

import type { PushOptInContext } from '@/domain/push'

/**
 * Où en est l'abonnement de ce navigateur :
 *  - `hidden` : rien à proposer (notifications non configurées, développement,
 *    navigateur qui ne sait pas faire et à qui l'on n'a rien à conseiller) ;
 *  - `checking` : lecture en cours, rien d'affiché pour ne pas clignoter ;
 *  - `install-first` : iPhone hors app installée — le Web Push n'y existe pas ;
 *  - `denied` : la permission a été refusée, seul le navigateur peut la rendre ;
 *  - `idle` : on peut proposer ;
 *  - `subscribed` : ce navigateur sera prévenu.
 */
export type PushOptInState =
  'hidden' | 'checking' | 'install-first' | 'denied' | 'idle' | 'subscribed'

export interface PushOptIn {
  state: PushOptInState
  pending: boolean
  error: string | null
  subscribe: () => void
  unsubscribe: () => void
}

async function readState(): Promise<PushOptInState> {
  const permission = pushPermission()
  if (permission === 'unsupported') return isAppleMobile() ? 'install-first' : 'hidden'
  if (permission === 'denied') return 'denied'

  const subscription = await currentPushSubscription()
  if (!subscription || permission !== 'granted') return 'idle'

  // Déjà abonné : on le redit au serveur, sans attendre ni rien afficher. Un
  // compte supprimé puis recréé, un appareil passé d'une personne à l'autre —
  // la base peut avoir perdu ce que le navigateur a gardé.
  void subscribePushAction(subscription.toJSON())
  return 'subscribed'
}

/**
 * L'opt-in « Me prévenir » (issue #7). Rien ne se passe sans un clic : la
 * permission n'est demandée que par `subscribe`.
 */
export function usePushOptIn({
  sessionId,
  context,
}: {
  sessionId: string
  context: PushOptInContext
}): PushOptIn {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const enabled = Boolean(publicKey) && isServiceWorkerEnabled()

  const [state, setState] = useState<PushOptInState>('checking')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const t = useTranslations('session.push')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void readState().then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  const subscribe = useCallback(() => {
    if (!publicKey) return
    setError(null)
    startTransition(async () => {
      const outcome = await subscribeToPush(publicKey)
      if (outcome.status === 'dismissed') return
      if (outcome.status === 'denied') {
        setState('denied')
        return
      }
      if (outcome.status === 'unsupported') {
        setState(isAppleMobile() ? 'install-first' : 'hidden')
        return
      }
      if (outcome.status === 'failed') {
        setError(t('failed'))
        return
      }

      const result = await subscribePushAction(outcome.subscription)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setState('subscribed')
      captureEvent('push_subscribed', { session_id: sessionId, context })
    })
  }, [publicKey, sessionId, context, t])

  const unsubscribe = useCallback(() => {
    setError(null)
    startTransition(async () => {
      const endpoint = await unsubscribeFromPush()
      if (endpoint) {
        const result = await unsubscribePushAction(endpoint)
        if (!result.ok) {
          setError(result.error)
          return
        }
      }
      setState('idle')
    })
  }, [])

  return { state: enabled ? state : 'hidden', pending, error, subscribe, unsubscribe }
}
