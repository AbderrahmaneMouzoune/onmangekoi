/**
 * Consentement à la mesure d'audience.
 *
 * Tant que le choix n'est pas « accepté », **rien** n'est chargé : ni script
 * PostHog, ni cookie, ni identifiant. Le seul stockage antérieur au choix est
 * celui du choix lui-même, exempté de consentement par la CNIL puisqu'il sert
 * à ne plus reposer la question (et à honorer un refus).
 */

export type ConsentChoice = 'granted' | 'denied' | 'unset'

/** Clé de stockage du choix. Changer sa valeur reposerait la question à tout le monde. */
export const CONSENT_STORAGE_KEY = 'omk.analytics.consent'

export function parseConsent(raw: string | null | undefined): ConsentChoice {
  return raw === 'granted' || raw === 'denied' ? raw : 'unset'
}

/** `localStorage` peut lever (Safari en navigation privée, cookies bloqués). */
function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readConsentFrom(storage: Storage | null): ConsentChoice {
  if (!storage) return 'unset'
  try {
    return parseConsent(storage.getItem(CONSENT_STORAGE_KEY))
  } catch {
    return 'unset'
  }
}

export function writeConsentTo(storage: Storage | null, choice: ConsentChoice): void {
  if (!storage) return
  try {
    if (choice === 'unset') storage.removeItem(CONSENT_STORAGE_KEY)
    else storage.setItem(CONSENT_STORAGE_KEY, choice)
  } catch {
    // Stockage indisponible : le choix vaut pour la visite en cours seulement.
  }
}

// `useSyncExternalStore` exige un instantané stable : on garde la valeur en
// mémoire et on ne relit le stockage qu'aux changements.
let snapshot: ConsentChoice | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function getConsent(): ConsentChoice {
  if (snapshot === null) snapshot = readConsentFrom(safeStorage())
  return snapshot
}

export function setConsent(choice: ConsentChoice): void {
  if (getConsent() === choice) return
  snapshot = choice
  writeConsentTo(safeStorage(), choice)
  notify()
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener)

  // Un choix fait dans un autre onglet vaut pour celui-ci.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== CONSENT_STORAGE_KEY) return
    snapshot = readConsentFrom(safeStorage())
    notify()
  }
  window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Réinitialise le cache mémoire — réservé aux tests. */
export function resetConsentCache(): void {
  snapshot = null
  listeners.clear()
}
