import { isDuoSession, parseSessionRules } from '@/domain/session-rules'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config'

import type { Database } from './models/database'
import type { PushSessionInfo, PushStatus } from '@/domain/push'
import type { PushSubscriptionInput } from '@/domain/schemas/push'
import type { Locale } from '@/i18n/config'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Abonnements Web Push (issue #7).
 *
 * Deux familles de fonctions :
 *  - celles de l'utilisateur courant, sous RLS (client lié aux cookies) :
 *    s'abonner, se désabonner ;
 *  - celles de la route d'envoi, avec le client à clé secrète
 *    (`supabase/admin.ts`) : lire la session et les abonnements de ses
 *    participants, purger ceux que le service push a oubliés.
 */

/** Un abonnement tel que la route d'envoi le transmet à `web-push`. */
export interface StoredPushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Un destinataire : son abonnement, et la langue dans laquelle le prévenir. */
export interface PushRecipient extends StoredPushSubscription {
  locale: Locale
}

/**
 * Enregistre l'abonnement du navigateur courant — ou le rafraîchit, ou le
 * reprend à un autre compte sur le même appareil. Tout se joue dans
 * `save_push_subscription`, qui valide et plafonne à 10 appareils.
 *
 * La langue est celle de l'interface au moment de l'abonnement : les
 * notifications partiront dans cette langue. Elle suit un changement de
 * langue au prochain passage par « Me prévenir », qui réenregistre
 * l'abonnement sans bruit.
 */
export async function savePushSubscription(
  supabase: SupabaseClient<Database>,
  subscription: PushSubscriptionInput,
  locale: Locale
): Promise<void> {
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.keys.p256dh,
    p_auth: subscription.keys.auth,
    p_locale: locale,
  })
  if (error) throw error
}

/** Désabonne ce navigateur. La RLS limite la suppression à ses propres lignes. */
export async function deletePushSubscription(
  supabase: SupabaseClient<Database>,
  endpoint: string
): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
}

/** La session à annoncer, avec son statut actuel. Client à clé secrète. */
export async function getPushSession(
  admin: SupabaseClient<Database>,
  sessionId: string
): Promise<(PushSessionInfo & { status: PushStatus | 'waiting' }) | null> {
  const { data, error } = await admin
    .from('sessions')
    .select('id, name, invite_code, status, rules, decided_restaurant_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  // Un duo se ferme avec sa décision quand il tombe d'accord (#61) : c'est ce
  // que la notification annonce, à la place du classement.
  const { rules, decided_restaurant_id, ...session } = data
  return {
    ...session,
    agreed: isDuoSession(parseSessionRules(rules)) && decided_restaurant_id !== null,
  }
}

/**
 * Les abonnements des participants de la session, auteur du changement
 * exclu, chacun avec sa langue. Client à clé secrète : ce sont les appareils
 * des autres.
 */
export async function getPushRecipients(
  admin: SupabaseClient<Database>,
  sessionId: string,
  actorId: string | null
): Promise<PushRecipient[]> {
  const { data: participants, error } = await admin
    .from('session_participants')
    .select('profile_id')
    .eq('session_id', sessionId)
    .not('profile_id', 'is', null)
  if (error) throw error

  const userIds = participants
    .map((participant) => participant.profile_id)
    .filter((id): id is string => id !== null && id !== actorId)
  if (userIds.length === 0) return []

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, locale')
    .in('user_id', userIds)
  if (subscriptionsError) throw subscriptionsError

  return subscriptions.map((row) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    // La base n'admet que `fr` et `en` ; le repli ne sert qu'au typage.
    locale: isLocale(row.locale) ? row.locale : DEFAULT_LOCALE,
  }))
}

/** Purge les abonnements que le service push a déclarés disparus (404, 410). */
export async function deletePushSubscriptions(
  admin: SupabaseClient<Database>,
  endpoints: string[]
): Promise<void> {
  if (endpoints.length === 0) return
  const { error } = await admin.from('push_subscriptions').delete().in('endpoint', endpoints)
  if (error) throw error
}
