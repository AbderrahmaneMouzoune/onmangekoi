/**
 * Catalogue des événements produit (issue #18).
 *
 * Règle non négociable : **aucune donnée personnelle**. Pas de pseudo, pas
 * d'email, pas de nom de restaurant ni de liste, pas de code ni de jeton
 * d'invitation (ce sont des secrets d'accès). Seuls des identifiants opaques
 * — UUID de session — et des compteurs sont transmis.
 */

import type { VoteKind, VoteValue } from '@/lib/vote'

/** Canal par lequel une invitation ou une liste a été diffusée. */
export type ShareMethod = 'code_copy' | 'link_copy' | 'native_share' | 'qr'

/** Chemin emprunté pour entrer dans une session. */
export type JoinMethod = 'code' | 'link' | 'scan'

/** Qui a mis fin à la session : le host, ou la clôture automatique en base. */
export type CloseReason = 'host' | 'auto'

/**
 * Propriétés attendues pour chaque événement. Le typage empêche d'envoyer
 * une propriété non prévue — donc d'y glisser une donnée personnelle par
 * inadvertance.
 */
export interface AnalyticsEventMap {
  session_created: {
    session_id: string
    restaurant_count: number
    /** Nombre de listes de favoris utilisées comme source */
    list_count: number
  }
  invite_shared: {
    session_id: string
    method: ShareMethod
  }
  session_joined: {
    session_id: string
    via: JoinMethod
  }
  vote_submitted: {
    session_id: string
    value: VoteValue
    kind: VoteKind
    /** Rang de la carte votée, à partir de 1 */
    position: number
    restaurant_count: number
  }
  session_closed: {
    session_id: string
    reason: CloseReason
    participant_count: number
    restaurant_count: number
  }
  list_shared: {
    method: ShareMethod
  }
}

export type AnalyticsEvent = keyof AnalyticsEventMap
