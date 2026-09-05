import { INVITE_CODE_LENGTH, SHARE_CODE_LENGTH } from '@/config/router.config'
import { codeFromSegment } from '@/lib/crockford'

const LEGACY_TOKEN = /^[a-f0-9]{32}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Next décode déjà les segments dynamiques ; un `%` tapé à la main ferait
 * lever `decodeURIComponent`. On repasse dessus sans jamais casser la page.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Ce qu'on peut recevoir en guise de secret de partage. */
export type ShareIdentifier =
  | { kind: 'code'; value: string }
  | { kind: 'token'; value: string }
  | { kind: 'invalid'; value: string }

/**
 * Ce qu'on peut recevoir dans l'URL d'une ressource privée : le code lisible
 * d'aujourd'hui, ou l'uuid des liens d'avant (onglet ouvert, favori, historique).
 */
export type RouteIdentifier =
  | { kind: 'code'; value: string }
  | { kind: 'id'; value: string }
  | { kind: 'invalid'; value: string }

function parseRouteParam(param: string, length: number): RouteIdentifier {
  const raw = safeDecode(param).trim()
  if (UUID.test(raw)) return { kind: 'id', value: raw.toLowerCase() }

  const code = codeFromSegment(raw, length)
  return code ? { kind: 'code', value: code } : { kind: 'invalid', value: raw }
}

/** `/sessions/7K3M9P` → code ; un ancien `/sessions/<uuid>` reste lu. */
export function parseSessionParam(param: string): RouteIdentifier {
  return parseRouteParam(param, INVITE_CODE_LENGTH)
}

/** `/lists/7K3M9P2QWX` → code ; un ancien `/lists/<uuid>` reste lu. */
export function parseListParam(param: string): RouteIdentifier {
  return parseRouteParam(param, SHARE_CODE_LENGTH)
}

/**
 * Résout le paramètre d'URL d'une liste partagée :
 *  - `7K3M9P2QWX` → code
 *  - `restos-du-bureau-7K3M9P2QWX` → code (ancien lien décoré d'un slug)
 *  - `a3f9…` (32 hex) → ancien token, toujours accepté
 */
export function parseSharedListParam(param: string): ShareIdentifier {
  const raw = safeDecode(param).trim()
  if (LEGACY_TOKEN.test(raw.toLowerCase())) return { kind: 'token', value: raw.toLowerCase() }

  const code = codeFromSegment(raw, SHARE_CODE_LENGTH)
  return code ? { kind: 'code', value: code } : { kind: 'invalid', value: raw }
}

/** Un identifiant d'invitation de session : code court, token long ou lien collé. */
export function parseInviteIdentifier(raw: string): ShareIdentifier {
  let value = raw.trim()

  if (/^https?:\/\//i.test(value) || value.includes('/join/')) {
    try {
      const url = new URL(value, 'http://placeholder.local')
      value = safeDecode(url.pathname.split('/').filter(Boolean).at(-1) ?? '')
    } catch {
      value = ''
    }
  }

  if (LEGACY_TOKEN.test(value.toLowerCase())) return { kind: 'token', value: value.toLowerCase() }

  const code = codeFromSegment(value, INVITE_CODE_LENGTH)
  return code ? { kind: 'code', value: code } : { kind: 'invalid', value }
}
