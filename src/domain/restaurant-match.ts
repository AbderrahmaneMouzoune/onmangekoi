/**
 * Retrouver « le » resto dont parle quelqu'un.
 *
 * « J'ai mangé à la ba » ne dit ni la casse, ni les accents, ni l'article :
 * l'IA transmet ce qu'elle a entendu, et c'est ici qu'on décide si un
 * candidat du catalogue (ou de Google) est assez évidemment le bon pour agir
 * sans redemander. Dans le doute on ne choisit pas : mieux vaut une question
 * de plus qu'un doublon ou un mauvais resto dans la liste.
 *
 * Pur, sans dépendance : testé seul.
 */

/** Articles et mots vides qu'on prononce sans y penser. */
const STOP_WORDS = new Set([
  'le',
  'la',
  'les',
  'l',
  'chez',
  'au',
  'aux',
  'du',
  'des',
  'de',
  'd',
  'the',
  'restaurant',
  'resto',
])

/** Minuscules, sans accents, sans ponctuation, espaces resserrés. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Le nom réduit à ce qui le distingue : sans articles ni « restaurant ». */
export function coreName(value: string): string {
  const words = normalizeName(value).split(' ')
  const kept = words.filter((word) => !STOP_WORDS.has(word))
  // « Le Resto » réduit à rien : on garde le nom entier plutôt qu'une chaîne vide.
  return (kept.length > 0 ? kept : words).join(' ')
}

/** Même resto pour une oreille humaine : mêmes mots qui comptent. */
export function isSameName(a: string, b: string): boolean {
  return coreName(a) === coreName(b)
}

/** Même ville, sans se soucier de la casse, des accents ni des tirets. */
export function isSameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return normalizeName(a) === normalizeName(b)
}

export interface MatchCandidate {
  name: string
  city?: string | null
}

export type MatchResult<T> =
  { kind: 'match'; candidate: T } | { kind: 'ambiguous'; candidates: T[] } | { kind: 'none' }

/**
 * Choisit le candidat qui correspond au nom entendu, s'il est unique.
 *
 *  - aucun candidat → `none` ;
 *  - un seul nom identique (au sens de `isSameName`) → `match` ;
 *  - plusieurs homonymes : la ville les départage si elle est donnée et n'en
 *    retient qu'un, sinon `ambiguous` ;
 *  - aucun nom identique mais des voisins → `ambiguous` : « La Ba » n'est
 *    peut-être pas « La Baraka », c'est à la personne de le dire.
 */
export function pickMatch<T extends MatchCandidate>(
  query: string,
  candidates: readonly T[],
  city?: string | null
): MatchResult<T> {
  if (candidates.length === 0) return { kind: 'none' }

  const sameName = candidates.filter((candidate) => isSameName(candidate.name, query))
  if (sameName.length === 1) return { kind: 'match', candidate: sameName[0] }

  if (sameName.length > 1) {
    const sameCity = city ? sameName.filter((candidate) => isSameCity(candidate.city, city)) : []
    if (sameCity.length === 1) return { kind: 'match', candidate: sameCity[0] }
    return { kind: 'ambiguous', candidates: sameCity.length > 1 ? sameCity : sameName }
  }

  return { kind: 'ambiguous', candidates: [...candidates] }
}
