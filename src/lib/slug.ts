const MAX_SLUG_LENGTH = 40

/**
 * Slug d'URL lisible : minuscules ASCII, accents retirés, tirets simples,
 * tronqué proprement. Purement décoratif dans nos liens de partage.
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
