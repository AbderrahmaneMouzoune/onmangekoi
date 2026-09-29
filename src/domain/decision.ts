/**
 * « On y va » : la décision du host (issue #55).
 *
 * Le classement dit ce que le groupe a voté ; la décision dit où il va. Elle
 * est posée en base par le host (`confirm_decision`) et `session_results` la
 * signale sur la ligne du restaurant retenu (`decided`). Comme pour le
 * départage, l'interface ne recalcule rien : elle lit, puis met en forme.
 *
 * La décision ne réécrit jamais le dépouillement — chaque ligne garde son
 * rang. Elle change seulement le restaurant qu'on annonce en tête.
 */

import type { SessionResultRow } from '@/data-access/models'

export interface Decision {
  /** Le restaurant retenu par le host. */
  decided: SessionResultRow
  /** Le premier du vote — le même que `decided` dans le cas ordinaire. */
  leader: SessionResultRow
  /**
   * Le host a préféré un restaurant que le vote ne plaçait pas en tête. Un ex
   * æquo de tête n'en fait pas partie : le choisir, c'est trancher l'égalité,
   * pas contredire le vote.
   */
  overridesVote: boolean
}

/** La décision lue dans un classement, ou `null` tant que le host n'a rien confirmé. */
export function readDecision(results: SessionResultRow[]): Decision | null {
  const decided = results.find((row) => row.decided)
  const leader = results[0]
  if (!decided || !leader) return null
  return { decided, leader, overridesVote: decided.rank !== 1 }
}

/**
 * Le restaurant à annoncer en tête : celui que le host a retenu s'il y en a
 * un, le premier du vote sinon. Sert au classement des participants comme au
 * podium public, qui portent tous deux la colonne `decided`.
 */
export function headlineOf<T extends { decided: boolean }>(rows: T[]): T | undefined {
  return rows.find((row) => row.decided) ?? rows[0]
}

/** Un restaurant que le host peut retenir, tel que le propose l'écran. */
export interface DecisionCandidate {
  restaurantId: string
  name: string
  rank: number
}

/**
 * Tout restaurant de la session peut être retenu — c'est la base qui le
 * garantit —, dans l'ordre du classement : le gagnant d'abord, proposé par
 * défaut, puis les suivants pour quand il a baissé le rideau.
 */
export function decisionCandidates(results: SessionResultRow[]): DecisionCandidate[] {
  return results.map((row) => ({
    restaurantId: row.restaurant_id,
    name: row.name,
    rank: row.rank,
  }))
}
