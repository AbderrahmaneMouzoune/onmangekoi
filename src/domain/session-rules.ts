/**
 * Règles de vote d'une session : quotas de jokers et seuil de clôture.
 * Tout est pur — la base rejoue les mêmes bornes (`public.rules_are_valid`) et
 * reste la source de vérité ; ces fonctions servent l'interface.
 */

import { countLabel } from '@/lib/format'

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

const percent = new Intl.NumberFormat('fr', { style: 'percent', maximumFractionDigits: 0 })

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
  }
}

export function isDefaultRules(rules: SessionRules): boolean {
  return (
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
}

/**
 * Règles à envoyer à la base, ou `null` quand rien ne change : l'appel reste
 * alors celui d'avant et c'est la valeur par défaut de la RPC qui parle.
 */
export function resolveRules(input: RulesInput): SessionRules | null {
  const rules: SessionRules = {
    superlikes: input.superlikes ?? DEFAULT_SESSION_RULES.superlikes,
    vetos: input.vetos ?? DEFAULT_SESSION_RULES.vetos,
    close_at_ratio: input.closeAtRatio ?? DEFAULT_SESSION_RULES.close_at_ratio,
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

export function formatRatio(ratio: number): string {
  return percent.format(ratio)
}

/** Résumé des règles, une phrase courte par réglage. */
export function describeRules(rules: SessionRules): string[] {
  return [
    rules.superlikes > 0
      ? countLabel(rules.superlikes, 'coup de cœur', 'coups de cœur')
      : 'Aucun coup de cœur',
    rules.vetos > 0 ? countLabel(rules.vetos, 'veto') : 'Aucun veto',
    rules.close_at_ratio >= 1
      ? 'Clôture quand tout le monde a voté'
      : `Clôture dès ${formatRatio(rules.close_at_ratio)} des votants`,
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

/** Pastille affichée sous un bouton joker : son état en deux mots. */
export function jokerBadge(quota: JokerQuota): string {
  if (quota.limit === 0) return 'hors jeu'
  if (quota.remaining === 0) return 'épuisé'
  return countLabel(quota.remaining, 'restant')
}

/**
 * Ce que le deck annonce sous les boutons. Les quotas étant réglables, la
 * phrase ne peut plus dire « une seule fois par session ».
 */
export function jokersSentence(rules: SessionRules): string {
  const parts: string[] = []
  if (rules.superlikes > 0) {
    parts.push(countLabel(rules.superlikes, 'coup de cœur', 'coups de cœur'))
  }
  if (rules.vetos > 0) parts.push(countLabel(rules.vetos, 'veto'))
  if (parts.length === 0) {
    return 'Pas de joker dans cette session : seuls « bof » et « ça me va » comptent.'
  }
  return `Les jokers comptent double : ${parts.join(' et ')} pour toute la session.`
}
