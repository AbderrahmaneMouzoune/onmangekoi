/**
 * Lecture de l'égalité de tête dans un classement.
 *
 * `session_results` porte déjà tout ce qu'il faut : chaque ligne concernée par
 * l'égalité dit sa place dans le départage (`tiebreak`). L'interface n'a donc
 * rien à recompter — elle résume, ici, ce que la base a décidé.
 */

import type { SessionResultRow, TiebreakMethod } from '@/data-access/models'

export interface Tiebreak {
  /** Les restaurants à égalité en tête, dans l'ordre du classement. */
  tied: SessionResultRow[]
  /** Comment l'égalité a été tranchée, ou `null` tant qu'elle ne l'est pas. */
  method: TiebreakMethod | null
  /** Le restaurant désigné par le tirage au sort, le cas échéant. */
  drawn: SessionResultRow | null
}

/**
 * L'égalité de tête d'un classement, ou `null` s'il n'y en a pas — le cas
 * ordinaire, où un restaurant gagne seul.
 */
export function readTiebreak(results: SessionResultRow[]): Tiebreak | null {
  const tied = results.filter((row) => row.tiebreak !== null)
  if (tied.length < 2) return null

  const drawn = tied.find((row) => row.tiebreak === 'winner') ?? null
  const method: TiebreakMethod | null = drawn
    ? 'draw'
    : tied.some((row) => row.tiebreak === 'runoff')
      ? 'runoff'
      : null

  return { tied, method, drawn }
}

/** « A, B et C » — l'énumération telle qu'on la dit. */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}
