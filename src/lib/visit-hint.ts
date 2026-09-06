/**
 * Mémoire de la dernière visite, au service des silhouettes de chargement.
 *
 * La coquille de l'accueil est prérendue : elle est la même pour tout le monde
 * et ne peut rien lire du serveur sans annuler ce prérendu. Or une silhouette
 * qui réserve « Tes sessions » et « Tes listes » ment à qui n'a ni l'un ni
 * l'autre — un premier visiteur, justement, n'a rien du tout.
 *
 * On garde donc dans le navigateur, et nulle part ailleurs, la forme de la
 * dernière visite : un pseudo, des sessions, des listes. Un court script
 * l'applique sur `<html>` avant le premier pixel (`VISIT_HINT_SCRIPT`) et les
 * silhouettes s'y accordent en CSS (variantes `seen-*`). Attribut absent —
 * première visite, stockage bloqué, navigation privée — vaut « on ne sait
 * rien » : aucune silhouette personnelle n'est réservée, ce qui est
 * exactement ce qu'un nouveau venu va voir.
 *
 * Rien ici n'est envoyé au serveur, et rien n'y est personnel : trois
 * booléens.
 */

/** Clé de stockage. La changer revient à oublier toutes les visites passées. */
export const VISIT_HINT_KEY = 'omk.visit'

/** Attribut porté par `<html>`, lu par les variantes `seen-*` de la CSS. */
export const VISIT_HINT_ATTRIBUTE = 'data-visit'

export interface VisitHint {
  /** Un pseudo existe : le tableau de bord affichera quelque chose. */
  account: boolean
  /** Au moins une session à la dernière visite. */
  sessions: boolean
  /** Au moins une liste à la dernière visite. */
  lists: boolean
}

const EMPTY: VisitHint = { account: false, sessions: false, lists: false }

/**
 * La valeur stockée *est* la valeur de l'attribut : une liste de jetons que le
 * script d'amorçage recopie tel quel, sans rien analyser.
 */
export function serializeVisitHint(hint: VisitHint): string {
  if (!hint.account) return ''
  return ['account', hint.sessions && 'sessions', hint.lists && 'lists'].filter(Boolean).join(' ')
}

export function parseVisitHint(raw: string | null | undefined): VisitHint {
  if (!raw) return EMPTY
  const tokens = raw.split(/\s+/)
  if (!tokens.includes('account')) return EMPTY
  return {
    account: true,
    sessions: tokens.includes('sessions'),
    lists: tokens.includes('lists'),
  }
}

/**
 * Script d'amorçage, inséré en tête de `<body>` : il court avant le premier
 * rendu, comme celui du thème, pour que la silhouette naisse déjà à la bonne
 * forme plutôt que de sauter une fois la page hydratée.
 */
export const VISIT_HINT_SCRIPT =
  `try{var h=localStorage.getItem(${JSON.stringify(VISIT_HINT_KEY)});` +
  `if(h)document.documentElement.setAttribute(${JSON.stringify(VISIT_HINT_ATTRIBUTE)},h)}catch(e){}`

/** `localStorage` peut lever (navigation privée, stockage bloqué). */
function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readRaw(storage: Storage | null): string {
  if (!storage) return ''
  try {
    return storage.getItem(VISIT_HINT_KEY) ?? ''
  } catch {
    return ''
  }
}

export function readVisitHint(storage: Storage | null = safeStorage()): VisitHint {
  return parseVisitHint(readRaw(storage))
}

/**
 * Retient ce que la page vient d'afficher. Les champs omis gardent leur valeur
 * précédente : l'en-tête ne sait rien des listes, l'accueil sait tout. Perdre
 * le pseudo (déconnexion, suppression du compte) efface le reste — sans
 * pseudo, il n'y a plus rien de personnel à réserver.
 */
export function rememberVisit(patch: Partial<VisitHint>): void {
  const storage = safeStorage()
  const stored = readRaw(storage)
  const value = serializeVisitHint({ ...parseVisitHint(stored), ...patch })
  if (value === stored) return

  applyVisitHint(value)
  if (!storage) return
  try {
    if (value) storage.setItem(VISIT_HINT_KEY, value)
    else storage.removeItem(VISIT_HINT_KEY)
  } catch {
    // Sans stockage, la silhouette de la prochaine visite restera neutre.
  }
}

/** Applique la forme au document courant, pour que la page en cours en profite. */
function applyVisitHint(value: string): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (value) root.setAttribute(VISIT_HINT_ATTRIBUTE, value)
  else root.removeAttribute(VISIT_HINT_ATTRIBUTE)
}
