import { isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from './config'

/**
 * Langue lue dans le navigateur, pour les rares écrans rendus hors du
 * `NextIntlClientProvider` (l'erreur globale, qui remplace le layout racine) :
 * le cookie `NEXT_LOCALE` s'il existe, sinon les langues du navigateur — le
 * même ordre que le proxy, qui lit `Accept-Language`.
 */
export function readClientLocale(): Locale {
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === LOCALE_COOKIE)?.[1]
  if (isLocale(cookie)) return cookie
  return negotiateLocale(navigator.languages.join(','))
}
