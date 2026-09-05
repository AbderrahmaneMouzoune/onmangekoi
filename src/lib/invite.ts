import { groupCode } from '@/lib/crockford'
import { parseInviteIdentifier, type ShareIdentifier } from '@/lib/share'

export type InviteIdentifier = ShareIdentifier

/**
 * Normalisation d'une invitation saisie par l'utilisateur.
 * Accepte un code court (Crockford base32, insensible à la casse, séparateurs
 * tolérés, I/L → 1, O → 0), un token long (32 hex) ou un lien complet.
 */
export function normalizeInviteInput(raw: string): InviteIdentifier {
  return parseInviteIdentifier(raw)
}

/** Affiche un code en deux blocs de trois : « A3F 9B2 ». */
export function formatInviteCode(code: string): string {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return clean.length === 6 ? groupCode(clean, 3, ' ') : clean
}
