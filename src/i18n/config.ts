/**
 * Langues de l'interface (issue #14). Pur, sans dépendance Next : importable
 * du proxy, des Server Components, du client et des tests.
 *
 * Le français reste la langue par défaut : c'est celle de l'équipe et des
 * contenus historiques (changelog, liens partagés). L'anglais s'ajoute pour
 * qu'un collègue non francophone puisse suivre la même session.
 */
export const LOCALES = ['fr', 'en'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'fr'

/**
 * Cookie qui retient la langue choisie. Le nom est celui qu'attend
 * `next-intl` : le proxy le lit avant `Accept-Language`.
 */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

/** Un an : un choix de langue ne se refait pas à chaque visite. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Fuseau des dates affichées. Le produit parle de déjeuners en France ;
 * sans fuseau explicite, le serveur (UTC) et le navigateur formateraient la
 * même heure différemment et React signalerait un écart d'hydratation.
 */
export const TIME_ZONE = 'Europe/Paris'

/** Nom de chaque langue dans sa propre langue — c'est ainsi qu'on la reconnaît. */
export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
}

/** Balise Open Graph (`og:locale`) de chaque langue. */
export const OG_LOCALES: Record<Locale, string> = {
  fr: 'fr_FR',
  en: 'en_GB',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Langue préférée d'après un en-tête `Accept-Language`, parmi celles qu'on
 * sait servir. Sert là où le proxy n'a pas tranché (route handlers hors du
 * segment `[locale]`) ; ailleurs, c'est `next-intl` qui négocie.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE
  const candidates = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';')
      const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='))
      const weight = q ? Number(q.slice(2)) : 1
      return { tag: tag.toLowerCase(), weight: Number.isNaN(weight) ? 0 : weight, index }
    })
    .filter((candidate) => candidate.tag && candidate.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)

  for (const { tag } of candidates) {
    const language = tag.split('-')[0]
    if (isLocale(language)) return language
  }
  return DEFAULT_LOCALE
}
