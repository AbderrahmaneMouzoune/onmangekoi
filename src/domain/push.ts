/**
 * Notifications push (issue #7) : ce qu'on dit, à qui, et combien de temps
 * le message garde un sens. Tout est pur — l'envoi vit dans
 * `use-cases/dispatch-session-push.ts`, l'affichage dans le service worker.
 */

import { router } from '@/config/router.config'

/** Les changements de statut qui préviennent : le lancement, la clôture. */
export const PUSH_STATUSES = ['voting', 'closed'] as const
export type PushStatus = (typeof PUSH_STATUSES)[number]

/**
 * Où l'abonnement est proposé : en salle d'attente (« au lancement ») ou
 * après ses votes (« du résultat »). Un seul abonnement couvre les deux — il
 * est celui du navigateur, pas d'une session —, seul le libellé change.
 */
export type PushOptInContext = 'launch' | 'results'

/**
 * Ce que reçoit le service worker. Le moins possible : le nom de la session,
 * que chaque destinataire connaît déjà, et l'adresse à ouvrir. Jamais un
 * pseudo, jamais un restaurant. La charge utile est chiffrée de bout en bout
 * (aes128gcm) : le service push du navigateur ne la lit pas.
 */
export interface PushMessage {
  title: string
  body: string
  /** Chemin interne ouvert au clic (`router.session`, `router.sessionResults`). */
  url: string
  /** Une notification par session : la clôture remplace le lancement au lieu de s'empiler. */
  tag: string
}

/** La part de la session dont le message a besoin. */
export interface PushSessionInfo {
  id: string
  name: string
  invite_code: string
}

export function pushMessageFor(status: PushStatus, session: PushSessionInfo): PushMessage {
  const tag = `session-${session.id}`
  if (status === 'voting') {
    return {
      title: 'Le vote est lancé',
      body: `${session.name} — à toi de voter.`,
      url: router.session(session),
      tag,
    }
  }
  return {
    title: 'Le classement est prêt',
    body: `${session.name} — découvre où vous allez manger.`,
    url: router.sessionResults(session),
    tag,
  }
}

/**
 * Durée de vie chez le service push, en secondes, si le navigateur est hors
 * ligne. Un lancement vieux de plus d'une heure n'appelle plus personne à
 * voter ; un classement reste bon à lire toute la journée.
 */
export const PUSH_TTL_SECONDS: Record<PushStatus, number> = {
  voting: 60 * 60,
  closed: 24 * 60 * 60,
}

/**
 * Sujet du message chez le service push : un message en attente de livraison
 * est remplacé par le suivant de même sujet. 32 caractères base64url au plus
 * — un UUID sans ses tirets, pile.
 */
export function pushTopic(sessionId: string): string {
  return sessionId.replace(/-/g, '').slice(0, 32)
}

/**
 * Le service push a oublié cet abonnement : 404 (inconnu) ou 410 (expiré,
 * désinscrit). Il ne reviendra pas — on le purge. Toute autre erreur (429,
 * 5xx, réseau) est passagère : l'abonnement reste.
 */
export function isGoneSubscription(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410
}
