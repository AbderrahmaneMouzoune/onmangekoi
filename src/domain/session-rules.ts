/**
 * Règles de vote d'une session : quotas de jokers, seuil de clôture, mode
 * ouvert et mode duo.
 * Tout est pur — la base rejoue les mêmes bornes (`public.rules_are_valid`) et
 * reste la source de vérité ; ces fonctions servent l'interface.
 */

import type { Json } from '@/data-access/models'

/** Au-delà, le joker n'en est plus un — même borne qu'en base. */
export const JOKERS_MAX = 5
/** Sous la moitié des votants, une minorité trancherait pour le groupe. */
export const CLOSE_AT_RATIO_MIN = 0.5

/**
 * Un alias de type et non une interface : c'est ce qui rend l'objet
 * transmissible tel quel à la RPC, dont l'argument jsonb est typé `Json`.
 */
export type SessionRules = {
  /** Coups de cœur (+2) dont chacun dispose pour toute la session */
  superlikes: number
  /** Vetos (−2) dont chacun dispose pour toute la session */
  vetos: number
  /** Part des participants qui doit avoir terminé pour que le classement tombe */
  close_at_ratio: number
  /**
   * Session ouverte (#58) : pas de salle d'attente, on rejoint pendant le vote
   * et seule l'échéance — obligatoire — ou le host ferment. Comme en base, la
   * clé n'existe que lorsqu'elle vaut `true` : une session ordinaire garde les
   * règles d'avant, à l'identique.
   */
  open?: true
  /**
   * Mode duo (#61) : deux places, pas de salle d'attente, et le premier
   * restaurant qui reçoit « ça me va » ou mieux des deux côtés ferme le vote.
   * Exclusif du mode ouvert ; écrit seulement quand il vaut `true`.
   */
  duo?: true
}

/** Les règles d'avant #16, que reprend toute session qui ne dit rien. */
export const DEFAULT_SESSION_RULES: SessionRules = {
  superlikes: 1,
  vetos: 1,
  close_at_ratio: 1,
}

/** Quotas proposés au formulaire de création. */
export const JOKER_CHOICES = [0, 1, 2, 3] as const
/** Seuils de clôture proposés au formulaire de création. */
export const CLOSE_AT_RATIO_CHOICES = [1, 0.8, 0.6, 0.5] as const

function readJoker(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(JOKERS_MAX, Math.max(0, Math.round(value)))
}

function readRatio(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(CLOSE_AT_RATIO_MIN, value))
}

/**
 * Lecture tolérante de la colonne `sessions.rules`. La base garantit déjà la
 * forme ; l'interface ne doit pour autant jamais casser sur une session
 * antérieure à la migration ou sur un aperçu tronqué — une règle illisible
 * reprend sa valeur par défaut.
 */
export function parseSessionRules(value: Json | null | undefined): SessionRules {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_SESSION_RULES
  const raw = value as Record<string, unknown>
  return {
    superlikes: readJoker(raw.superlikes, DEFAULT_SESSION_RULES.superlikes),
    vetos: readJoker(raw.vetos, DEFAULT_SESSION_RULES.vetos),
    close_at_ratio: readRatio(raw.close_at_ratio, DEFAULT_SESSION_RULES.close_at_ratio),
    ...(raw.open === true ? { open: true as const } : {}),
    ...(raw.duo === true ? { duo: true as const } : {}),
  }
}

/** Session ouverte : chacun vote à son heure, jusqu'à l'échéance. */
export function isOpenSession(rules: SessionRules): boolean {
  return rules.open === true
}

/** Session à deux : le premier accord décide, sinon le classement habituel. */
export function isDuoSession(rules: SessionRules): boolean {
  return rules.duo === true
}

export function isDefaultRules(rules: SessionRules): boolean {
  return (
    !isOpenSession(rules) &&
    !isDuoSession(rules) &&
    rules.superlikes === DEFAULT_SESSION_RULES.superlikes &&
    rules.vetos === DEFAULT_SESSION_RULES.vetos &&
    rules.close_at_ratio === DEFAULT_SESSION_RULES.close_at_ratio
  )
}

/** Ce que le formulaire de création transmet, champ par champ. */
export interface RulesInput {
  superlikes?: number | null
  vetos?: number | null
  closeAtRatio?: number | null
  open?: boolean | null
  duo?: boolean | null
}

/**
 * Règles à envoyer à la base, ou `null` quand rien ne change : l'appel reste
 * alors celui d'avant et c'est la valeur par défaut de la RPC qui parle.
 *
 * En mode ouvert, le seuil n'a pas d'objet — le nombre de votants n'est pas
 * connu d'avance — et repart à 100 %, comme la base le ferait : un seuil
 * réglé avant de cocher « ouverte » ne doit pas voyager pour rien. Même chose
 * en duo : à deux, « tout le monde » ne se divise pas.
 *
 * Duo et session ouverte s'excluent — la base refuse les deux à la fois. Le
 * duo l'emporte ici : il ne s'obtient que depuis sa propre page, qui ne
 * propose pas l'autre mode.
 */
export function resolveRules(input: RulesInput): SessionRules | null {
  const duo = input.duo === true
  const open = input.open === true && !duo
  const rules: SessionRules = {
    superlikes: input.superlikes ?? DEFAULT_SESSION_RULES.superlikes,
    vetos: input.vetos ?? DEFAULT_SESSION_RULES.vetos,
    close_at_ratio: open || duo ? 1 : (input.closeAtRatio ?? DEFAULT_SESSION_RULES.close_at_ratio),
    ...(open ? { open: true as const } : {}),
    ...(duo ? { duo: true as const } : {}),
  }
  return isDefaultRules(rules) ? null : rules
}

/**
 * Nombre de votants qui doivent avoir terminé pour que le classement tombe.
 * Même calcul qu'en base : on arrondit au votant supérieur — 80 % de trois
 * personnes, c'est trois, pas 2,4 — et jamais moins d'un.
 *
 * L'epsilon rattrape la virgule flottante : `5 * 0.8` vaut 4,000000000000001
 * en JavaScript, et un `ceil` nu exigerait cinq votants au lieu de quatre.
 */
export function requiredFinishers(participantCount: number, ratio: number): number {
  if (participantCount <= 0) return 0
  return Math.min(participantCount, Math.max(1, Math.ceil(participantCount * ratio - 1e-9)))
}

/**
 * Une ligne du résumé des règles, sous forme de description : l'interface la
 * traduit (`session.rules.lines.<kind>`). Le seuil reste un ratio, que le
 * composant formate dans la langue de la personne.
 */
export type RuleLine =
  | { kind: 'open' | 'duo' | 'closeAtDeadline' | 'closeDuo' | 'closeAll' }
  | { kind: 'superlikes' | 'vetos'; count: number }
  | { kind: 'closeAtRatio'; ratio: number }

/**
 * Résumé des règles, une ligne courte par réglage. Une session ouverte
 * s'annonce en premier — c'est ce qui change le plus la façon d'y entrer —
 * et remplace le seuil, qui ne s'y applique pas, par l'échéance.
 */
export function describeRules(rules: SessionRules): RuleLine[] {
  const jokers: RuleLine[] = [
    { kind: 'superlikes', count: rules.superlikes },
    { kind: 'vetos', count: rules.vetos },
  ]
  if (isOpenSession(rules)) {
    return [{ kind: 'open' }, ...jokers, { kind: 'closeAtDeadline' }]
  }
  if (isDuoSession(rules)) {
    return [{ kind: 'duo' }, ...jokers, { kind: 'closeDuo' }]
  }
  return [
    ...jokers,
    rules.close_at_ratio >= 1
      ? { kind: 'closeAll' }
      : { kind: 'closeAtRatio', ratio: rules.close_at_ratio },
  ]
}

/** Les deux jokers du deck, tels que `VoteAction.kind` les nomme. */
export type JokerKind = 'fav' | 'veto'

export interface JokerQuota {
  /** Ce que les règles accordent pour toute la session */
  limit: number
  /** Ce qu'il en reste à dépenser */
  remaining: number
}

export type JokerQuotas = Record<JokerKind, JokerQuota>

export function jokerQuotas(rules: SessionRules, used: Record<JokerKind, number>): JokerQuotas {
  return {
    fav: { limit: rules.superlikes, remaining: Math.max(0, rules.superlikes - used.fav) },
    veto: { limit: rules.vetos, remaining: Math.max(0, rules.vetos - used.veto) },
  }
}

/**
 * Pastille affichée sous un bouton joker : son état en deux mots
 * (`session.vote.jokerBadge.<kind>`).
 */
export type JokerBadge = { kind: 'off' } | { kind: 'spent' } | { kind: 'remaining'; count: number }

export function jokerBadge(quota: JokerQuota): JokerBadge {
  if (quota.limit === 0) return { kind: 'off' }
  if (quota.remaining === 0) return { kind: 'spent' }
  return { kind: 'remaining', count: quota.remaining }
}

/**
 * Ce que le deck annonce sous les boutons (`session.deck.jokers.<kind>`).
 * Les quotas étant réglables, la phrase ne peut plus dire « une seule fois
 * par session » : elle nomme les jokers en jeu, et eux seuls.
 */
export type JokersSentence =
  | { kind: 'none' }
  | { kind: 'superlikes'; superlikes: number }
  | { kind: 'vetos'; vetos: number }
  | { kind: 'both'; superlikes: number; vetos: number }

export function jokersSentence(rules: SessionRules): JokersSentence {
  const { superlikes, vetos } = rules
  if (superlikes > 0 && vetos > 0) return { kind: 'both', superlikes, vetos }
  if (superlikes > 0) return { kind: 'superlikes', superlikes }
  if (vetos > 0) return { kind: 'vetos', vetos }
  return { kind: 'none' }
}
