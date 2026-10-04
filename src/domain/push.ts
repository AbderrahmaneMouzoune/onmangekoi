/**
 * Notifications push (issue #7) : ce qu'on dit, à qui, et combien de temps
 * le message garde un sens. Tout est pur — l'envoi vit dans
 * `use-cases/dispatch-session-push.ts`, l'affichage dans le service worker.
 */

import { router } from '@/config/router.config'

import type { Locale } from '@/i18n/config'

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
 *
 * Le titre et le corps sont déjà dans la langue de l'abonné, retenue à
 * l'abonnement (`push_subscriptions.locale`) ; `lang` la redit à la
 * notification, pour la synthèse vocale.
 */
export interface PushMessage {
  title: string
  body: string
  /** Chemin interne ouvert au clic (`router.session`, `router.sessionResults`). */
  url: string
  /** Une notification par session : la clôture remplace le lancement au lieu de s'empiler. */
  tag: string
  lang: Locale
}

/** La part de la session dont le message a besoin. */
export interface PushSessionInfo {
  id: string
  name: string
  invite_code: string
  /**
   * Un duo clos sur un accord (#61) : on n'annonce pas un classement, mais
   * que c'est décidé. Toujours sans nommer le restaurant.
   */
  agreed?: boolean
}

/** Ce qu'annonce la notification — la clé de son texte dans `pwa.push`. */
export type PushMessageKind = 'voting' | 'agreed' | 'closed'

/**
 * La notification d'un changement de statut, avant traduction : de quoi
 * parler, où mener, sous quel sujet. Le texte, lui, dépend de chaque abonné
 * — c'est `use-cases/dispatch-session-push.ts` qui le fabrique, une fois par
 * langue.
 */
export interface PushNotice {
  kind: PushMessageKind
  /** Nom de la session, tel que ses participants le connaissent. */
  session: string
  url: string
  tag: string
}

export function pushNoticeFor(status: PushStatus, session: PushSessionInfo): PushNotice {
  const tag = `session-${session.id}`
  if (status === 'voting') {
    return { kind: 'voting', session: session.name, url: router.session(session), tag }
  }
  return {
    kind: session.agreed ? 'agreed' : 'closed',
    session: session.name,
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
