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
    label: 'Veto',
    short: 'Veto',
    joker: true,
    hint: 'Jamais. Compte −2, une seule fois par session.',
    shortcuts: ['1'],
  },
  {
    kind: 'no',
    value: 0,
    label: 'Bof',
    short: 'Bof',
    joker: false,
    hint: 'Pas cette fois. Compte 0.',
    shortcuts: ['2', 'ArrowLeft'],
  },
  {
    kind: 'yes',
    value: 1,
    label: 'Ça me va',
    short: 'Oui',
    joker: false,
    hint: 'Partant. Compte +1.',
    shortcuts: ['3', 'ArrowRight', 'Enter'],
  },
  {
    kind: 'fav',
    value: 2,
    label: 'Coup de cœur',
    short: 'Cœur',
    joker: true,
    hint: 'Vraiment envie. Compte +2, une seule fois par session.',
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
