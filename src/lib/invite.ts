/**
 * Normalisation d'une invitation saisie par l'utilisateur.
 * Accepte indifféremment :
 *  - un code court « A3F9B2 » (6 caractères, insensible à la casse, espaces tolérés)
 *  - un token long (32 hex)
 *  - un lien complet `https://…/join/<token>` ou `…/join/<code>`
 */

export const INVITE_CODE_REGEX = /^[A-Z0-9]{6}$/
export const INVITE_TOKEN_REGEX = /^[a-f0-9]{32}$/

export type InviteIdentifier =
  | { kind: 'code'; value: string }
  | { kind: 'token'; value: string }
  | { kind: 'invalid'; value: string }

export function normalizeInviteInput(raw: string): InviteIdentifier {
  let value = raw.trim()

  // Lien collé : on ne garde que le dernier segment de chemin
  if (/^https?:\/\//i.test(value) || value.includes('/join/')) {
    try {
      const url = new URL(value, 'http://placeholder.local')
      const segments = url.pathname.split('/').filter(Boolean)
      value = segments.at(-1) ?? ''
    } catch {
      value = ''
    }
  }

  const compact = value.replace(/[\s-]+/g, '')

  if (INVITE_TOKEN_REGEX.test(compact.toLowerCase())) {
    return { kind: 'token', value: compact.toLowerCase() }
  }
  if (INVITE_CODE_REGEX.test(compact.toUpperCase())) {
    return { kind: 'code', value: compact.toUpperCase() }
  }
  return { kind: 'invalid', value: compact }
}

/** Affiche un code en deux blocs de trois : « A3F 9B2 ». */
export function formatInviteCode(code: string): string {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return clean.length === 6 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean
}
