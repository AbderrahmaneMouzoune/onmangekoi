import { z } from 'zod'

import { PUSH_STATUSES } from '@/domain/push'

/** Les bornes de `public.push_subscriptions` : la base les rejoue et tranche en dernier. */
export const PUSH_ENDPOINT_MAX = 2048
const BASE64URL = /^[A-Za-z0-9_-]+=*$/

export const PushEndpointSchema = z
  .url({ protocol: /^https$/, error: 'Abonnement invalide' })
  .max(PUSH_ENDPOINT_MAX, 'Abonnement invalide')

/**
 * Ce que `PushSubscription.toJSON()` rend dans le navigateur — les seuls
 * champs retenus. `expirationTime` est ignoré : les services push ne le
 * renseignent pas, et un abonnement expiré se signale de lui-même par un 410.
 */
export const PushSubscriptionSchema = z.object({
  endpoint: PushEndpointSchema,
  keys: z.object({
    p256dh: z.string().min(1).max(256).regex(BASE64URL, 'Abonnement invalide'),
    auth: z.string().min(1).max(64).regex(BASE64URL, 'Abonnement invalide'),
  }),
})

export type PushSubscriptionInput = z.infer<typeof PushSubscriptionSchema>

/**
 * Corps de l'appel du trigger `notify_session_status_change` vers
 * `/api/push/dispatch`. `actor_id` est nul quand personne n'a provoqué le
 * changement — la clôture à l'échéance.
 */
export const PushDispatchSchema = z.object({
  session_id: z.uuid(),
  status: z.enum(PUSH_STATUSES),
  actor_id: z.uuid().nullable(),
})

export type PushDispatchInput = z.infer<typeof PushDispatchSchema>
