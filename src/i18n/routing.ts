import { defineRouting } from 'next-intl/routing'

import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALES } from './config'

/**
 * Routage des langues, sans préfixe visible (`localePrefix: 'never'`) : les
 * liens partagés (`/join/<code>`, `/l/<code>`, `/r/<code>`) restent les mêmes
 * quelle que soit la langue de qui les envoie ou les ouvre.
 *
 * Le proxy choisit la langue (cookie `NEXT_LOCALE`, sinon `Accept-Language`,
 * sinon le français) et réécrit la requête vers le segment caché
 * `app/[locale]/…`. C'est ce qui garde la coquille statique de chaque page :
 * la langue est un paramètre de route, prérendu pour `fr` et pour `en`, et
 * non une lecture de cookie qui rendrait tout le site dynamique.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'never',
  localeCookie: {
    name: LOCALE_COOKIE,
    maxAge: LOCALE_COOKIE_MAX_AGE,
  },
  // Sans préfixe, il n'y a pas d'URL alternative à annoncer par langue.
  alternateLinks: false,
})
