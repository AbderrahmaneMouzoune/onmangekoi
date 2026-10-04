'use server'

import { getLocale } from 'next-intl/server'

import { getCurrentUser } from '@/data-access/auth'
import { deletePushSubscription, savePushSubscription } from '@/data-access/push'
import { createServerClient } from '@/data-access/supabase/server'
import { PushEndpointSchema, PushSubscriptionSchema } from '@/domain/schemas/push'
import { errorMessage, translateError } from '@/i18n/server'

import type { ActionResult } from './types'

/**
 * Enregistre l'abonnement push de ce navigateur pour l'utilisateur courant
 * (issue #7). Idempotent : le bouton « Me prévenir » la rappelle aussi,
 * silencieusement, quand le navigateur est déjà abonné — de quoi recoller un
 * abonnement que la base aurait perdu.
 *
 * Seuls `endpoint` et `keys` sont retenus de ce qu'envoie le navigateur. La
 * langue, elle, vient de la requête — celle de l'interface affichée — et
 * sera celle des notifications.
 */
export async function subscribePushAction(subscription: unknown): Promise<ActionResult> {
  const parsed = PushSubscriptionSchema.safeParse(subscription)
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_push_subscription') }

  const [supabase, user, locale] = await Promise.all([
    createServerClient(),
    getCurrentUser(),
    getLocale(),
  ])
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  try {
    await savePushSubscription(supabase, parsed.data, locale)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }
  return { ok: true, data: undefined }
}

/** Désabonne ce navigateur. Ne touche qu'aux abonnements de l'utilisateur courant (RLS). */
export async function unsubscribePushAction(endpoint: unknown): Promise<ActionResult> {
  const parsed = PushEndpointSchema.safeParse(endpoint)
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_push_subscription') }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  try {
    await deletePushSubscription(supabase, parsed.data)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }
  return { ok: true, data: undefined }
}
