/**
 * Comparaison de versions sémantiques `X.Y.Z`.
 *
 * Sert à deux endroits : ranger les notes de version de la plus récente à la
 * plus ancienne, et savoir si la dernière est plus récente que celle déjà lue
 * par le navigateur. Comparer les chaînes ne suffirait pas — `0.10.0` est
 * *après* `0.9.0`, alors qu'il vient avant dans l'ordre alphabétique.
 *
 * Tout ce qui n'est pas un nombre vaut 0 : une version mal formée se range au
 * début plutôt que de faire tomber la page. Le schéma Zod des notes, lui,
 * refuse déjà les versions qui ne sont pas au format.
 */

const SEGMENTS = 3

/** `v1.2.3` → `[1, 2, 3]`, en complétant et en ignorant ce qui suit. */
function segments(version: string): number[] {
  const parts = version.trim().replace(/^v/i, '').split('.')
  return Array.from({ length: SEGMENTS }, (_, index) => {
    const parsed = Number.parseInt(parts[index] ?? '', 10)
    return Number.isFinite(parsed) ? parsed : 0
  })
}

/** Négatif si `a` précède `b`, positif s'il le suit, 0 s'ils se valent. */
export function compareVersions(a: string, b: string): number {
  const left = segments(a)
  const right = segments(b)
  for (let index = 0; index < SEGMENTS; index += 1) {
    const diff = left[index] - right[index]
    if (diff !== 0) return diff
  }
  return 0
}

/** `a` est-il strictement plus récent que `b` ? */
export function isNewerVersion(a: string, b: string): boolean {
  return compareVersions(a, b) > 0
}
