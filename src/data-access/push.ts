import type { Database } from './models/database'
import type { PushSessionInfo, PushStatus } from '@/domain/push'
import type { PushSubscriptionInput } from '@/domain/schemas/push'
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

/**
 * Enregistre l'abonnement du navigateur courant — ou le rafraîchit, ou le
 * reprend à un autre compte sur le même appareil. Tout se joue dans
 * `save_push_subscription`, qui valide et plafonne à 10 appareils.
 */
export async function savePushSubscription(
  supabase: SupabaseClient<Database>,
  subscription: PushSubscriptionInput
): Promise<void> {
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.keys.p256dh,
    p_auth: subscription.keys.auth,
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
    .select('id, name, invite_code, status')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Les abonnements des participants de la session, auteur du changement
 * exclu. Client à clé secrète : ce sont les appareils des autres.
 */
export async function getPushRecipients(
  admin: SupabaseClient<Database>,
  sessionId: string,
  actorId: string | null
): Promise<StoredPushSubscription[]> {
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
    .select('endpoint, p256dh, auth')
    .in('user_id', userIds)
  if (subscriptionsError) throw subscriptionsError

  return subscriptions.map((row) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
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
