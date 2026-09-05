import { isCrockford, normalizeCrockford } from '@/lib/crockford'

const MAX_SLUG_LENGTH = 40

/**
 * Slug d'URL lisible : minuscules ASCII, accents retirés, tirets simples,
 * tronqué proprement. Purement décoratif dans nos liens.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (slug.length <= MAX_SLUG_LENGTH) return slug
  const cut = slug.slice(0, MAX_SLUG_LENGTH)
  const lastDash = cut.lastIndexOf('-')
  return (lastDash > 10 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '')
}

/**
 * Segment d'URL lisible : « Déj du lundi » + `7K3M9P` → `dej-du-lundi-7K3M9P`.
 * Le texte de tête est décoratif : seul le code final identifie la ressource,
 * donc renommer ne casse aucun lien déjà partagé.
 */
export function slugWithCode(name: string | null | undefined, code: string): string {
  const slug = name ? slugify(name) : ''
  return slug ? `${slug}-${code}` : code
}

/**
 * Code final d'un segment `<slug>-<CODE>`, ou `null` s'il n'y en a pas.
 * La saisie humaine est tolérée (casse, séparateurs, I/L → 1, O → 0) : un code
 * groupé collé tel quel (`H4V2Q-8ZX0M`) est reconnu comme un slug complet.
 */
export function codeFromSlug(segment: string, length: number): string | null {
  const raw = segment.trim()

  // Sans slug devant, le segment entier est le code (séparateurs d'affichage inclus).
  const whole = normalizeCrockford(raw)
  if (isCrockford(whole, length)) return whole

  const tail = normalizeCrockford(raw.split('-').at(-1) ?? '')
  return isCrockford(tail, length) ? tail : null
}
