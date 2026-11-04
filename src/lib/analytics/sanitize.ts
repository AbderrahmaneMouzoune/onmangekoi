/**
 * Masquage des URLs avant envoi à PostHog.
 *
 * Les ressources s'adressent par leur code court, celui-là même qui donne
 * l'accès : `/sessions/7K3M9P` et `/join/7K3M9P` portent le code d'invitation,
 * `/l/H4V2Q8ZX0M` le code de partage d'une liste, `/r/H4V2Q8ZX0M` celui d'un
 * classement public, et `?next=` reconduit l'un ou l'autre. Rien de tout cela
 * ne doit sortir : on ne transmet que le **motif de route**
 * (`/sessions/[code]`), jamais la valeur du segment.
 */

/** Motifs de routes dynamiques, testés dans l'ordre (le plus spécifique d'abord). */
const ROUTE_PATTERNS: readonly [RegExp, string][] = [
  [/^\/sessions\/(?!new(?:\/|$))[^/]+\/results$/, '/sessions/[code]/results'],
  [/^\/sessions\/(?!new(?:\/|$))[^/]+$/, '/sessions/[code]'],
  [/^\/join\/[^/]+$/, '/join/[code]'],
  [/^\/lists\/(?!new(?:\/|$))[^/]+$/, '/lists/[code]'],
  [/^\/l\/[^/]+$/, '/l/[code]'],
  [/^\/r\/[^/]+$/, '/r/[code]'],
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
const URL_PROPERTY = /(?:url|path|pathname|referrer|host|href)$/i

/** Objet littéral (pas une date, pas une instance de classe) : le seul qu'on parcourt. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Garde-fou contre une structure anormalement profonde (ou cyclique). */
const MAX_DEPTH = 8

function sanitizeValue(key: string, value: unknown, depth: number): unknown {
  if (typeof value === 'string') return URL_PROPERTY.test(key) ? sanitizeUrl(value) : value
  if (depth >= MAX_DEPTH) return value
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(key, item, depth + 1))
  if (isPlainObject(value)) return sanitizeRecord(value, depth + 1)
  return value
}

function sanitizeRecord(record: Record<string, unknown>, depth: number): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) result[key] = sanitizeValue(key, value, depth)
  return result
}

/**
 * Applique `sanitizeUrl` à toutes les propriétés d'un événement qui portent
 * une URL — `$current_url`, `$pathname`, `$referrer`, `$initial_*`,
 * `$session_entry_*`… — sans avoir à les énumérer une par une.
 *
 * Le parcours descend dans les objets et tableaux imbriqués : les Web Vitals
 * embarquent l'URL de la page dans `$web_vitals_LCP_event.$current_url`, et
 * les exceptions décrivent leurs fichiers dans `$exception_list[].stacktrace`.
 */
export function sanitizeProperties<T extends Record<string, unknown>>(properties: T): T {
  return sanitizeRecord(properties, 0) as T
}
