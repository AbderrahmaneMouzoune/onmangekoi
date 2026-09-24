/**
 * Historique des sessions et statistiques personnelles (issue #6).
 *
 * L'historique se feuillette **par curseur**, jamais par offset : une session
 * créée pendant qu'on remonte le fil décalerait toutes les pages suivantes et
 * ferait apparaître deux fois la même ligne. Le curseur désigne donc la
 * dernière ligne rendue — sa date et son id — et la page suivante reprend
 * strictement en dessous.
 *
 * Il voyage dans l'URL, donc il est encodé en base64url : un couple opaque
 * plutôt que deux paramètres bricolables à la main. Rien n'y est secret — un
 * curseur forgé ne donne accès à rien, la RPC ne renvoie de toute façon que
 * les sessions de son appelant — mais un jeton unique reste plus simple à
 * transporter et à valider qu'une date recollée à un uuid.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Sessions rendues par page d'historique. */
export const SESSION_HISTORY_PAGE_SIZE = 12

/** Position dans l'historique : la dernière session rendue. */
export interface SessionCursor {
  createdAt: string
  id: string
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string | null {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
  } catch {
    return null
  }
}

/** Curseur pointant sur la ligne donnée : la page suivante commence après elle. */
export function encodeSessionCursor(entry: { created_at: string; id: string }): string {
  return toBase64Url(`${entry.created_at}|${entry.id}`)
}

/**
 * Curseur reçu dans l'URL. Tout ce qui n'est pas une date suivie d'un uuid
 * vaut « pas de curseur » : on retombe sur la première page au lieu de lever.
 */
export function parseSessionCursor(raw: string | null | undefined): SessionCursor | null {
  if (!raw) return null
  const decoded = fromBase64Url(raw.trim())
  if (!decoded) return null

  const separator = decoded.lastIndexOf('|')
  if (separator === -1) return null

  const createdAt = decoded.slice(0, separator)
  const id = decoded.slice(separator + 1)
  if (!UUID.test(id) || Number.isNaN(Date.parse(createdAt))) return null

  return { createdAt, id: id.toLowerCase() }
}

/**
 * Part de coups de cœur dans mes votes. `null` tant que je n'ai voté nulle
 * part : « 0 % » se lirait comme un jugement alors qu'il n'y a rien à juger.
 */
export function favoriteRate(favVotes: number, totalVotes: number): number | null {
  if (totalVotes <= 0) return null
  return favVotes / totalVotes
}
