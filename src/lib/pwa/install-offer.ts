/**
 * Quand proposer d'installer l'app.
 *
 * Pas à la première visite : quelqu'un qui arrive par un lien d'invitation
 * n'a encore aucune raison de garder l'app sur son écran d'accueil. On attend
 * une **première session réussie** — un classement final affiché —, preuve
 * que l'app a servi et servira sans doute encore demain midi.
 *
 * Refuser (« Plus tard ») fait taire la proposition pendant
 * `DISMISS_COOLDOWN_DAYS` jours ; elle revient ensuite une fois, au cas où.
 *
 * Tout vit dans le `localStorage` du navigateur : deux valeurs, rien de
 * personnel, rien d'envoyé au serveur. Stockage bloqué → rien n'est retenu,
 * et la proposition ne s'affiche jamais (faute de session connue).
 */

/** Une session a abouti dans ce navigateur (`'1'`). */
export const SESSION_COMPLETED_KEY = 'omk.pwa.session-completed'
/** Date du dernier « Plus tard », en millisecondes depuis l'epoch. */
export const INSTALL_DISMISSED_KEY = 'omk.pwa.install-dismissed'

export const DISMISS_COOLDOWN_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

export interface InstallOfferState {
  sessionCompleted: boolean
  /** Dernier refus, ou `null` si jamais refusé. */
  dismissedAt: number | null
}

const EMPTY: InstallOfferState = { sessionCompleted: false, dismissedAt: null }

export interface InstallOfferContext {
  state: InstallOfferState
  /** Le navigateur a émis `beforeinstallprompt` et l'invitation est encore disponible. */
  canPrompt: boolean
  /** L'app tourne déjà installée. */
  standalone: boolean
  now: number
}

export function shouldOfferInstall({
  state,
  canPrompt,
  standalone,
  now,
}: InstallOfferContext): boolean {
  if (!canPrompt || standalone || !state.sessionCompleted) return false
  if (state.dismissedAt === null) return true
  return now - state.dismissedAt >= DISMISS_COOLDOWN_DAYS * DAY_MS
}

export function parseDismissedAt(raw: string | null | undefined): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** `localStorage` peut lever (navigation privée, stockage bloqué). */
function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readInstallOfferFrom(storage: Storage | null): InstallOfferState {
  if (!storage) return EMPTY
  try {
    return {
      sessionCompleted: storage.getItem(SESSION_COMPLETED_KEY) === '1',
      dismissedAt: parseDismissedAt(storage.getItem(INSTALL_DISMISSED_KEY)),
    }
  } catch {
    return EMPTY
  }
}

// `useSyncExternalStore` exige un instantané stable : on garde la valeur en
// mémoire et on ne relit le stockage qu'aux changements.
let snapshot: InstallOfferState | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function getInstallOffer(): InstallOfferState {
  if (snapshot === null) snapshot = readInstallOfferFrom(safeStorage())
  return snapshot
}

export function getServerInstallOffer(): InstallOfferState {
  return EMPTY
}

function write(key: string, value: string, next: InstallOfferState): void {
  snapshot = next
  const storage = safeStorage()
  if (storage) {
    try {
      storage.setItem(key, value)
    } catch {
      // Sans stockage, l'état ne vaut que pour la visite en cours.
    }
  }
  notify()
}

/** À appeler quand un classement final s'affiche pour un participant. */
export function markSessionCompleted(): void {
  const current = getInstallOffer()
  if (current.sessionCompleted) return
  write(SESSION_COMPLETED_KEY, '1', { ...current, sessionCompleted: true })
}

export function dismissInstallOffer(now: number = Date.now()): void {
  write(INSTALL_DISMISSED_KEY, String(now), { ...getInstallOffer(), dismissedAt: now })
}

export function subscribeInstallOffer(listener: () => void): () => void {
  listeners.add(listener)

  // Un refus ou une session dans un autre onglet vaut pour celui-ci.
  const onStorage = (event: StorageEvent) => {
    if (
      event.key !== null &&
      event.key !== SESSION_COMPLETED_KEY &&
      event.key !== INSTALL_DISMISSED_KEY
    ) {
      return
    }
    snapshot = readInstallOfferFrom(safeStorage())
    notify()
  }
  window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Réinitialise le cache mémoire — réservé aux tests. */
export function resetInstallOfferCache(): void {
  snapshot = null
  listeners.clear()
}
