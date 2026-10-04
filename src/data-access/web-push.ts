import 'server-only'

import webpush, { WebPushError } from 'web-push'

import { env } from '@/env'

import type { StoredPushSubscription } from './push'
import type { PushMessage } from '@/domain/push'

/**
 * Envoi Web Push : chiffrement de la charge utile (aes128gcm) et signature
 * VAPID, confiés à la bibliothèque `web-push`. Côté Node, dans une Route
 * Handler — l'edge-runtime de Supabase ne tourne ni en local ni en CI.
 *
 * Interrupteur : sans les trois moitiés de la configuration VAPID
 * (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), rien
 * ne part. La clé privée ne sort jamais d'ici.
 */

export function isWebPushConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT)
}

export interface WebPushOptions {
  /** Durée de vie chez le service push si l'appareil est hors ligne, en secondes. */
  ttl: number
  /** Un message en attente de même sujet est remplacé par celui-ci. */
  topic: string
  urgency: 'normal' | 'high'
}

/** Issue d'un envoi : livré au service push, ou refusé avec son code HTTP s'il y en a un. */
export type WebPushResult = { ok: true } | { ok: false; statusCode?: number }

export async function sendWebPush(
  subscription: StoredPushSubscription,
  message: PushMessage,
  options: WebPushOptions
): Promise<WebPushResult> {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  const subject = env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return { ok: false }

  try {
    // Seuls l'adresse et les clés partent chez `web-push` : rien d'autre de
    // l'abonnement (sa langue, par exemple) n'a à quitter le serveur.
    const { endpoint, keys } = subscription
    await webpush.sendNotification({ endpoint, keys }, JSON.stringify(message), {
      vapidDetails: { subject, publicKey, privateKey },
      TTL: options.ttl,
      topic: options.topic,
      urgency: options.urgency,
      timeout: 5000,
    })
    return { ok: true }
  } catch (error) {
    if (error instanceof WebPushError) return { ok: false, statusCode: error.statusCode }
    return { ok: false }
  }
}
