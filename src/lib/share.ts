import { INVITE_CODE_LENGTH, SHARE_CODE_LENGTH } from '@/config/router.config'
import { isCrockford, normalizeCrockford } from '@/lib/crockford'

const LEGACY_TOKEN = /^[a-f0-9]{32}$/

export type ShareIdentifier =
  | { kind: 'code'; value: string }
  | { kind: 'token'; value: string }
  | { kind: 'invalid'; value: string }

/**
 * Résout le paramètre d'URL d'une liste partagée :
 *  - `restos-du-bureau-7K3M9P2QWX` → code (slug ignoré)
 *  - `7K3M9P2QWX` → code
 *  - `a3f9…` (32 hex) → ancien token, toujours accepté
 */
export function parseSharedListParam(param: string): ShareIdentifier {
  const raw = decodeURIComponent(param).trim()
  if (LEGACY_TOKEN.test(raw.toLowerCase())) return { kind: 'token', value: raw.toLowerCase() }

  const tail = raw.split('-').at(-1) ?? ''
  const code = normalizeCrockford(tail)
  if (isCrockford(code, SHARE_CODE_LENGTH)) return { kind: 'code', value: code }

  return { kind: 'invalid', value: raw }
}

/** Un identifiant d'invitation de session : code court, token long ou lien collé. */
export function parseInviteIdentifier(raw: string): ShareIdentifier {
  let value = raw.trim()

  if (/^https?:\/\//i.test(value) || value.includes('/join/')) {
    try {
      const url = new URL(value, 'http://placeholder.local')
      value = url.pathname.split('/').filter(Boolean).at(-1) ?? ''
      value = decodeURIComponent(value)
    } catch {
      value = ''
    }
  }

  if (LEGACY_TOKEN.test(value.toLowerCase())) return { kind: 'token', value: value.toLowerCase() }

  const code = normalizeCrockford(value)
  if (code.length === INVITE_CODE_LENGTH && /^[A-Z0-9]{6}$/.test(code)) {
    return { kind: 'code', value: code }
  }
  return { kind: 'invalid', value: code }
}
