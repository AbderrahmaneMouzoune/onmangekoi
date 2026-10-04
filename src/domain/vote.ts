/**
 * Les quatre actions de vote et leur valeur en base.
 *
 * Aucun libellé ici : l'interface les traduit par `kind` —
 * `session.vote.actions.<kind>` (le nom), `session.vote.short.<kind>` (le
 * bouton compact), `session.vote.hints.<kind>` (ce que le vote compte).
 */

export const VOTE_VALUES = [-2, 0, 1, 2] as const
export type VoteValue = (typeof VOTE_VALUES)[number]

export type VoteKind = 'veto' | 'no' | 'yes' | 'fav'

export interface VoteAction {
  kind: VoteKind
  value: VoteValue
  /** Consomme un joker, en quota réglable par session (`sessions.rules`) */
  joker: boolean
  /**
   * Raccourcis clavier du deck, écrits comme `KeyboardEvent.key` — c'est aussi
   * la forme attendue par `aria-keyshortcuts`, qui les annonce aux lecteurs
   * d'écran. Le chiffre suit la position du bouton, de gauche à droite.
   */
  shortcuts: readonly string[]
}

export const VOTE_ACTIONS: readonly VoteAction[] = [
  {
    kind: 'veto',
    value: -2,
    joker: true,
    shortcuts: ['1'],
  },
  {
    kind: 'no',
    value: 0,
    joker: false,
    shortcuts: ['2', 'ArrowLeft'],
  },
  {
    kind: 'yes',
    value: 1,
    joker: false,
    shortcuts: ['3', 'ArrowRight', 'Enter'],
  },
  {
    kind: 'fav',
    value: 2,
    joker: true,
    shortcuts: ['4'],
  },
] as const

export function voteActionByValue(value: number): VoteAction | undefined {
  return VOTE_ACTIONS.find((action) => action.value === value)
}

/** L'action déclenchée par une touche, `undefined` si elle ne vote pas. */
export function voteActionByKey(key: string): VoteAction | undefined {
  return VOTE_ACTIONS.find((action) => action.shortcuts.includes(key))
}

export function isVoteValue(value: unknown): value is VoteValue {
  return typeof value === 'number' && (VOTE_VALUES as readonly number[]).includes(value)
}

export function formatScore(score: number): string {
  if (score > 0) return `+${score}`
  if (score < 0) return `−${Math.abs(score)}`
  return '0'
}
