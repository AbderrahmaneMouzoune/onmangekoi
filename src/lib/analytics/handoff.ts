/**
 * Passage de témoin entre l'intention et la page d'arrivée.
 *
 * Créer ou rejoindre une session se termine par un `redirect()` serveur : la
 * Server Action ne rend jamais la main au composant qui a déclenché l'appel.
 * Impossible donc de mesurer un succès à l'endroit du clic — un événement
 * envoyé là compterait aussi les échecs, ce qui fausserait tout l'entonnoir.
 *
 * On dépose donc l'intention dans `sessionStorage` avant la navigation, et la
 * page de session la consomme **une seule fois** à l'arrivée. Si la création
 * échoue, l'intention n'est jamais consommée et expire d'elle-même.
 */

const ENTRY_KEY = 'omk.analytics.entry'
const SEEN_PREFIX = 'omk.analytics.seen.'

/** Au-delà, l'intention est considérée comme abandonnée. */
const ENTRY_TTL_MS = 5 * 60_000

export type SessionEntry =
  { kind: 'created'; listCount: number } | { kind: 'joined'; via: 'code' | 'scan' }

interface StoredEntry {
  entry: SessionEntry
  at: number
}

/** `sessionStorage` peut lever (navigation privée, stockage bloqué). */
function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

function isSessionEntry(value: unknown): value is SessionEntry {
  if (typeof value !== 'object' || value === null) return false
  const kind = (value as { kind?: unknown }).kind
  return kind === 'created' || kind === 'joined'
}

export function rememberSessionEntry(
  entry: SessionEntry,
  storage: Storage | null = safeStorage(),
  now: number = Date.now()
): void {
  if (!storage) return
  try {
    storage.setItem(ENTRY_KEY, JSON.stringify({ entry, at: now } satisfies StoredEntry))
  } catch {
    // Sans stockage, l'arrivée sera comptée comme une entrée par lien.
  }
}

/** Lit et supprime l'intention en attente : une intention ne sert qu'une fois. */
export function takeSessionEntry(
  storage: Storage | null = safeStorage(),
  now: number = Date.now()
): SessionEntry | null {
  if (!storage) return null

  let raw: string | null
  try {
    raw = storage.getItem(ENTRY_KEY)
    storage.removeItem(ENTRY_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { entry, at } = parsed as Partial<StoredEntry>
    if (typeof at !== 'number' || now - at > ENTRY_TTL_MS) return null
    return isSessionEntry(entry) ? entry : null
  } catch {
    return null
  }
}

/**
 * Vrai la première fois seulement, pour la durée de l'onglet. Sert aux
 * événements qu'un rafraîchissement ne doit pas dupliquer (entrée en session,
 * affichage du QR code).
 */
export function markOnce(key: string, storage: Storage | null = safeStorage()): boolean {
  if (!storage) return true
  try {
    if (storage.getItem(SEEN_PREFIX + key) !== null) return false
    storage.setItem(SEEN_PREFIX + key, '1')
    return true
  } catch {
    return true
  }
}
