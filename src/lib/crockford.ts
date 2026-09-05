/**
 * Crockford base32 : alphabet de 32 symboles sans I, L, O ni U, conçu pour être
 * lu à voix haute et recopié sans ambiguïté. À la saisie, I et L valent 1,
 * O vaut 0, la casse et les séparateurs sont ignorés.
 * https://www.crockford.com/base32.html
 */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const CROCKFORD_CHAR = /^[0-9A-HJKMNP-TV-Z]+$/

/** Normalise une saisie humaine : majuscules, séparateurs retirés, I/L → 1, O → 0. */
export function normalizeCrockford(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s\-_.]+/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
}

/** Vrai si `value` est déjà un code Crockford valide de la longueur donnée. */
export function isCrockford(value: string, length?: number): boolean {
  if (!CROCKFORD_CHAR.test(value)) return false
  return length === undefined || value.length === length
}

/** Groupe un code pour l'affichage : `ABCDEFGHJK` → `ABCDE-FGHJK`. */
export function groupCode(code: string, size: number, separator = '-'): string {
  const clean = code.replace(/[\s\-_.]+/g, '')
  if (clean.length <= size) return clean
  const groups: string[] = []
  for (let i = 0; i < clean.length; i += size) groups.push(clean.slice(i, i + size))
  return groups.join(separator)
}
