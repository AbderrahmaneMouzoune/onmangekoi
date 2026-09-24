/**
 * Catalogue des événements produit (issue #18).
 *
 * Règle non négociable : **aucune donnée personnelle**. Pas de pseudo, pas
 * d'email, pas de nom de restaurant ni de liste, pas de code ni de jeton
 * d'invitation (ce sont des secrets d'accès). Seuls des identifiants opaques
 * — UUID de session — et des compteurs sont transmis.
 */

import type { SessionCloseReason } from '@/domain/session-deadline'
import type { VoteKind, VoteValue } from '@/domain/vote'

/** Canal par lequel une invitation ou une liste a été diffusée. */
export type ShareMethod = 'code_copy' | 'link_copy' | 'native_share' | 'qr'

/** Chemin emprunté pour entrer dans une session. */
export type JoinMethod = 'code' | 'link' | 'scan'

/** Qui a mis fin à la session : le host, le vote complet, ou l'échéance. */
export type CloseReason = SessionCloseReason

/** Portée d'un lien de classement partagé. */
export type ResultsScope = 'public' | 'participants'

/**
 * Propriétés attendues pour chaque événement. Le typage empêche d'envoyer
 * une propriété non prévue — donc d'y glisser une donnée personnelle par
 * inadvertance.
 */
export interface AnalyticsEventMap {
  /**
   * Amorçage du quartier : les restos proches entrés en base d'un coup. Le
   * premier geste d'un groupe qui arrive devant un carnet vide — donc la
   * marche à surveiller.
   */
  neighbourhood_seeded: {
    /** Nombre de restaurants entrés en base */
    restaurant_count: number
    /** Lieux rendus par Google que la base a refusés */
    failed_count: number
  }
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
  /** Des restos apportés à une session en attente, par n'importe quel participant. */
  session_restaurants_added: {
    session_id: string
    /** Nombre de restaurants ajoutés en une fois */
    added_count: number
    /** Taille du deck après l'ajout */
    restaurant_count: number
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
  /** Un groupe récurrent est sauvegardé depuis un classement. */
  group_saved: {
    member_count: number
  }
  /** Un groupe est pré-invité : combien de personnes sont attendues. */
  group_invited: {
    session_id: string
    invited_count: number
  }
  /** Ouverture du journal des versions ; la version lue, rien d'autre. */
  changelog_opened: {
    version: string
  }
  /**
   * Le host a ouvert ou refermé le lien public du classement. Le code du lien
   * est un secret d'accès : il ne sort jamais d'ici, seul l'état compte.
   */
  results_visibility_changed: {
    session_id: string
    is_public: boolean
  }
  results_shared: {
    session_id: string
    method: ShareMethod
    /** Le lien diffusé : le podium public, ou la salle réservée aux votants */
    scope: ResultsScope
  }
}

export type AnalyticsEvent = keyof AnalyticsEventMap
