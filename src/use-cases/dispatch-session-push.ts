import { createTranslator } from 'next-intl'

import { deletePushSubscriptions, getPushRecipients, getPushSession } from '@/data-access/push'
import { sendWebPush } from '@/data-access/web-push'
import { isGoneSubscription, pushNoticeFor, pushTopic, PUSH_TTL_SECONDS } from '@/domain/push'
import { MESSAGES } from '@/i18n/messages'

import type { Database } from '@/data-access/models/database'
import type { PushMessage, PushNotice } from '@/domain/push'
import type { PushDispatchInput } from '@/domain/schemas/push'
import type { Locale } from '@/i18n/config'
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
 * Chacun est prévenu dans sa langue — celle de l'interface au moment où il
 * s'est abonné (`push_subscriptions.locale`) : le texte est fabriqué une fois
 * par langue présente parmi les destinataires.
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

  const notice = pushNoticeFor(input.status, session)
  const messages = new Map<Locale, PushMessage>()
  const messageIn = (locale: Locale) => {
    let message = messages.get(locale)
    if (!message) {
      message = translatePushNotice(notice, locale)
      messages.set(locale, message)
    }
    return message
  }
  const options = {
    ttl: PUSH_TTL_SECONDS[input.status],
    topic: pushTopic(session.id),
    // Le lancement appelle à voter maintenant : il réveille l'appareil.
    urgency: input.status === 'voting' ? ('high' as const) : ('normal' as const),
  }

  const results = await Promise.all(
    recipients.map((subscription) =>
      sendWebPush(subscription, messageIn(subscription.locale), options)
    )
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

/**
 * Le texte d'une notification dans une langue donnée. Hors de toute requête
 * — l'appel vient de la base, pas d'un navigateur —, la langue ne peut pas
 * venir de la requête : c'est un traducteur explicite (`createTranslator`) sur
 * les mêmes messages que l'interface (`pwa.push`).
 */
export function translatePushNotice(notice: PushNotice, locale: Locale): PushMessage {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'pwa.push' })
  return {
    title: t(`${notice.kind}.title`),
    body: t(`${notice.kind}.body`, { session: notice.session }),
    url: notice.url,
    tag: notice.tag,
    lang: locale,
  }
}
