/**
 * Masquage des URLs avant envoi à PostHog.
 *
 * Les ressources s'adressent par leur code court, celui-là même qui donne
 * l'accès : `/sessions/7K3M9P` et `/join/7K3M9P` portent le code d'invitation,
 * `/l/H4V2Q8ZX0M` le code de partage d'une liste, et `?next=` reconduit l'un
 * ou l'autre. Rien de tout cela ne doit sortir : on ne transmet que le
 * **motif de route** (`/sessions/[code]`), jamais la valeur du segment.
 */

/** Motifs de routes dynamiques, testés dans l'ordre (le plus spécifique d'abord). */
const ROUTE_PATTERNS: readonly [RegExp, string][] = [
  [/^\/sessions\/(?!new(?:\/|$))[^/]+\/results$/, '/sessions/[code]/results'],
  [/^\/sessions\/(?!new(?:\/|$))[^/]+$/, '/sessions/[code]'],
  [/^\/join\/[^/]+$/, '/join/[code]'],
  [/^\/lists\/(?!new(?:\/|$))[^/]+$/, '/lists/[code]'],
  [/^\/l\/[^/]+$/, '/l/[code]'],
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
