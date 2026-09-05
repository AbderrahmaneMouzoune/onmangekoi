/**
 * Les quatre actions de vote et leur valeur en base.
 * Les libellés sont ceux affichés dans l'interface.
 */

export const VOTE_VALUES = [-2, 0, 1, 2] as const
export type VoteValue = (typeof VOTE_VALUES)[number]

export type VoteKind = 'veto' | 'no' | 'yes' | 'fav'

export interface VoteAction {
  kind: VoteKind
  value: VoteValue
  label: string
  /** Libellé court pour les boutons compacts */
  short: string
  /** Consomme un joker (1 par session) */
  joker: boolean
  hint: string
}

export const VOTE_ACTIONS: readonly VoteAction[] = [
  {
    kind: 'veto',
    value: -2,
    label: 'Veto',
    short: 'Veto',
    joker: true,
    hint: 'Jamais. Compte −2, une seule fois par session.',
  },
  {
    kind: 'no',
    value: 0,
    label: 'Bof',
    short: 'Bof',
    joker: false,
    hint: 'Pas cette fois. Compte 0.',
  },
  {
    kind: 'yes',
    value: 1,
    label: 'Ça me va',
    short: 'Oui',
    joker: false,
    hint: 'Partant. Compte +1.',
  },
  {
    kind: 'fav',
    value: 2,
    label: 'Coup de cœur',
    short: 'Cœur',
    joker: true,
    hint: 'Vraiment envie. Compte +2, une seule fois par session.',
  },
] as const

export function voteActionByValue(value: number): VoteAction | undefined {
  return VOTE_ACTIONS.find((action) => action.value === value)
}

export function isVoteValue(value: unknown): value is VoteValue {
  return typeof value === 'number' && (VOTE_VALUES as readonly number[]).includes(value)
}

export function formatScore(score: number): string {
  if (score > 0) return `+${score}`
  if (score < 0) return `−${Math.abs(score)}`
  return '0'
}
