/**
 * Masquage des URLs avant envoi à PostHog.
 *
 * Les URLs de l'app portent des secrets et des données lisibles : jeton
 * d'invitation (`/join/<token>` suffit pour rejoindre une session), code de
 * partage de liste, nom de liste dans le slug, destination `?next=`. Rien de
 * tout cela ne doit sortir : on ne transmet que le **motif de route**
 * (`/sessions/[id]`), jamais la valeur du segment.
 */

/** Motifs de routes dynamiques, testés dans l'ordre (le plus spécifique d'abord). */
const ROUTE_PATTERNS: readonly [RegExp, string][] = [
  [/^\/sessions\/(?!new(?:\/|$))[^/]+\/results$/, '/sessions/[id]/results'],
  [/^\/sessions\/(?!new(?:\/|$))[^/]+$/, '/sessions/[id]'],
  [/^\/join\/[^/]+$/, '/join/[invite]'],
  [/^\/lists\/(?!new(?:\/|$))[^/]+$/, '/lists/[id]'],
  [/^\/l\/[^/]+$/, '/l/[list]'],
]

/**
 * UUID, jeton hexadécimal, code Crockford : tout ce qui identifie quelque
 * chose. Volontairement sensible à la casse — les segments statiques de l'app
 * sont en minuscules, les codes en majuscules.
 */
const OPAQUE_SEGMENT =
  /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{16,}|[0-9A-Z]{6,})$/

/**
 * Remplace les segments identifiants d'un chemin par leur motif de route.
 * Les routes inconnues passent par un filet de sécurité : tout segment qui
 * ressemble à un identifiant devient `[id]`, pour qu'une route ajoutée plus
 * tard ne fuite pas par oubli.
 */
export function maskPathname(pathname: string): string {
  if (!pathname.startsWith('/')) return maskPathname(`/${pathname}`)

  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

  for (const [pattern, mask] of ROUTE_PATTERNS) {
    if (pattern.test(normalized)) return mask
  }

  return normalized
    .split('/')
    .map((segment) => (OPAQUE_SEGMENT.test(segment) ? '[id]' : segment))
    .join('/')
}

/**
 * Nettoie une URL (absolue ou relative) : chemin masqué, query string et
 * fragment supprimés. Une valeur qui n'est pas une URL (`$direct`) ressort
 * telle quelle.
 */
export function sanitizeUrl(value: string): string {
  if (!value) return value

  if (value.startsWith('/')) return maskPathname(value.split(/[?#]/)[0] ?? value)

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return value
  }

  return `${url.origin}${maskPathname(url.pathname)}`
}

/** Propriétés porteuses d'une URL ou d'un chemin, quel que soit leur préfixe. */
const URL_PROPERTY = /(?:url|pathname|referrer|host|href)$/i

/**
 * Applique `sanitizeUrl` à toutes les propriétés d'un événement qui portent
 * une URL — `$current_url`, `$pathname`, `$referrer`, `$initial_*`,
 * `$session_entry_*`… — sans avoir à les énumérer une par une.
 */
export function sanitizeProperties<T extends Record<string, unknown>>(properties: T): T {
  const result: Record<string, unknown> = { ...properties }

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && URL_PROPERTY.test(key)) {
      result[key] = sanitizeUrl(value)
    }
  }

  return result as T
}
