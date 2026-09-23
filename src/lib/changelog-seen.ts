/**
 * Mémoire de la dernière note de version lue, dans le navigateur et nulle part
 * ailleurs.
 *
 * La pastille « nouveautés » de l'en-tête ne dit qu'une chose : *quelque chose
 * a changé depuis ta dernière visite*. Elle a donc besoin d'un repère, et ce
 * repère n'a rien à faire sur le serveur — c'est une préférence d'affichage,
 * pas une donnée de compte. Une seule chaîne est stockée : un numéro de
 * version.
 *
 * Première visite, stockage bloqué ou navigation privée : rien n'est connu, et
 * on n'affiche aucune pastille. Montrer « nouveau » à qui découvre l'app
 * n'aurait aucun sens, tout l'est. On note simplement la version du jour pour
 * que la *prochaine* fasse, elle, une vraie nouveauté.
 */

import { isNewerVersion } from '@/lib/version'

/** Clé de stockage. La changer revient à rendre la dernière note non lue. */
export const CHANGELOG_SEEN_KEY = 'omk.changelog'

/** `localStorage` peut lever (navigation privée, stockage bloqué). */
function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Dernière version lue, `null` si on n'en sait rien. */
export function readSeenRelease(storage: Storage | null = safeStorage()): string | null {
  if (!storage) return null
  try {
    return storage.getItem(CHANGELOG_SEEN_KEY) || null
  } catch {
    return null
  }
}

/** Retient une version comme lue. Ne recule jamais. */
export function rememberSeenRelease(
  version: string,
  storage: Storage | null = safeStorage()
): void {
  if (!storage) return
  const seen = readSeenRelease(storage)
  if (seen && !isNewerVersion(version, seen)) return
  try {
    storage.setItem(CHANGELOG_SEEN_KEY, version)
  } catch {
    // Sans stockage, la pastille restera muette : c'est le moindre mal.
  }
}

/**
 * Pose le repère à la première visite, sans jamais écraser celui qui existe.
 * C'est ce qui évite d'annoncer « du nouveau » à qui n'a encore rien vu.
 */
export function initSeenRelease(version: string, storage: Storage | null = safeStorage()): void {
  if (!storage || readSeenRelease(storage)) return
  rememberSeenRelease(version, storage)
}

/** Reste-t-il une note plus récente que ce qui a été lu ? */
export function hasUnreadRelease(latest: string | null, seen: string | null): boolean {
  if (!latest || !seen) return false
  return isNewerVersion(latest, seen)
}
