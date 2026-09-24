import { router } from '@/config/router.config'

/**
 * Raccourcis clavier globaux, à la GitHub ou Gmail : deux touches à la suite,
 * la première dit l'intention (`n` pour nouveau, `g` pour aller à), la
 * seconde la cible. Deux lettres à la suite ne risquent pas d'entrer en
 * collision avec les touches du deck de vote (chiffres, flèches, Entrée) ni
 * avec un champ en cours de saisie, qui garde toutes ses touches.
 */
export interface SequenceShortcut {
  /** Touches à enchaîner, telles que `KeyboardEvent.key` les nomme, en minuscules. */
  keys: readonly [string, string]
  label: string
  href: string
}

export const CREATE_SHORTCUTS: readonly SequenceShortcut[] = [
  { keys: ['n', 's'], label: 'Nouvelle session', href: router.sessionNew() },
  { keys: ['n', 'l'], label: 'Nouvelle liste', href: router.listNew() },
]

export const GO_SHORTCUTS: readonly SequenceShortcut[] = [
  { keys: ['g', 'h'], label: 'Accueil', href: router.home() },
  { keys: ['g', 'j'], label: 'Rejoindre une session', href: router.join() },
  { keys: ['g', 'l'], label: 'Mes listes', href: router.lists() },
  { keys: ['g', 'g'], label: 'Mes groupes', href: router.groups() },
  { keys: ['g', 'a'], label: 'Mon compte', href: router.account() },
]

export const SEQUENCE_SHORTCUTS: readonly SequenceShortcut[] = [
  ...CREATE_SHORTCUTS,
  ...GO_SHORTCUTS,
]

/** Touche seule qui ouvre l'aide des raccourcis. */
export const HELP_KEY = '?'
/** Touche seule qui pose le focus sur le champ de recherche de la page. */
export const SEARCH_KEY = '/'

/** Délai au-delà duquel une première touche est oubliée. */
export const SEQUENCE_TIMEOUT_MS = 1500

/** Le raccourci d'une destination, pour l'afficher à côté d'un lien. */
export function shortcutFor(href: string): SequenceShortcut | undefined {
  return SEQUENCE_SHORTCUTS.find((shortcut) => shortcut.href === href)
}

/** « g puis l » — la forme parlée d'une séquence, pour un `title` ou une aide. */
export function describeSequence(shortcut: SequenceShortcut): string {
  return `${shortcut.keys[0]} puis ${shortcut.keys[1]}`
}

export type SequenceMatch =
  { kind: 'match'; shortcut: SequenceShortcut } | { kind: 'prefix' } | { kind: 'none' }

/**
 * Ce que valent les touches tapées jusqu'ici : un raccourci complet, le début
 * d'un raccourci (on attend la suite), ou rien.
 */
export function matchSequence(keys: readonly string[]): SequenceMatch {
  if (keys.length === 0 || keys.length > 2) return { kind: 'none' }
  const [first, second] = keys
  if (second === undefined) {
    return SEQUENCE_SHORTCUTS.some((shortcut) => shortcut.keys[0] === first)
      ? { kind: 'prefix' }
      : { kind: 'none' }
  }
  const shortcut = SEQUENCE_SHORTCUTS.find(
    (candidate) => candidate.keys[0] === first && candidate.keys[1] === second
  )
  return shortcut ? { kind: 'match', shortcut } : { kind: 'none' }
}

/**
 * Un raccourci ne doit rien voler à une saisie en cours, ni à une modale qui
 * a la main : on laisse ces touches à leur cible.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true
  return Boolean(target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]'))
}
