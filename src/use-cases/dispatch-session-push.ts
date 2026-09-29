import { deletePushSubscriptions, getPushRecipients, getPushSession } from '@/data-access/push'
import { sendWebPush } from '@/data-access/web-push'
import { isGoneSubscription, pushMessageFor, pushTopic, PUSH_TTL_SECONDS } from '@/domain/push'

import type { Database } from '@/data-access/models/database'
import type { PushDispatchInput } from '@/domain/schemas/push'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PushDispatchReport {
  /** Messages acceptés par un service push. */
  sent: number
  /** Abonnements purgés : le service push les a oubliés (404, 410). */
  purged: number
  /** Échecs passagers (429, 5xx, réseau) : l'abonnement reste. */
  failed: number
}

const NOTHING: PushDispatchReport = { sent: 0, purged: 0, failed: 0 }

/**
 * Prévient les participants d'une session qui vient d'être lancée ou close,
 * sauf l'auteur du changement — appelé par la base (`notify_session_status_change`)
 * via `/api/push/dispatch`.
 *
 * La session est relue avant d'envoyer : l'appel part après le commit, mais
 * rien n'empêche qu'elle ait bougé entre-temps. Un « le vote est lancé »
 * arrivé après la clôture enverrait voter dans une session finie — si le
 * statut ne correspond plus, on se tait.
 *
 * Les envois partent en parallèle ; ceux que le service push refuse en 404 ou
 * 410 désignent des abonnements morts (navigateur désinstallé, permission
 * retirée), purgés dans la foulée.
 */
export async function dispatchSessionPushUseCase(
  admin: SupabaseClient<Database>,
  input: PushDispatchInput
): Promise<PushDispatchReport> {
  const session = await getPushSession(admin, input.session_id)
  if (!session || session.status !== input.status) return NOTHING

  const recipients = await getPushRecipients(admin, session.id, input.actor_id)
  if (recipients.length === 0) return NOTHING

  const message = pushMessageFor(input.status, session)
  const options = {
    ttl: PUSH_TTL_SECONDS[input.status],
    topic: pushTopic(session.id),
    // Le lancement appelle à voter maintenant : il réveille l'appareil.
    urgency: input.status === 'voting' ? ('high' as const) : ('normal' as const),
  }

  const results = await Promise.all(
    recipients.map((subscription) => sendWebPush(subscription, message, options))
  )

  const gone = recipients
    .filter((_, index) => {
      const result = results[index]
      return result !== undefined && !result.ok && isGoneSubscription(result.statusCode)
    })
    .map((subscription) => subscription.endpoint)
  await deletePushSubscriptions(admin, gone)

  const sent = results.filter((result) => result.ok).length
  return { sent, purged: gone.length, failed: results.length - sent - gone.length }
}
