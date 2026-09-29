import { cookies, headers } from 'next/headers'
import { locale as rootLocale } from 'next/root-params'
import { getRequestConfig } from 'next-intl/server'

import { isLocale, LOCALE_COOKIE, negotiateLocale, TIME_ZONE, type Locale } from './config'
import { MESSAGES } from './messages'

/** En-tête posé par le proxy (`next-intl`) sur chaque requête qu'il réécrit. */
const PROXY_LOCALE_HEADER = 'x-next-intl-locale'

/**
 * Configuration `next-intl` de chaque rendu serveur.
 *
 * La langue vient, dans l'ordre :
 *  1. d'une langue explicite (`getTranslations({ locale, namespace })`), ce
 *     que font les images Open Graph et le manifest, qui la reçoivent en
 *     paramètre ;
 *  2. du segment `[locale]` via `next/root-params` — le cas de toutes les
 *     pages. C'est un paramètre de route : il ne rend pas la page dynamique,
 *     la coquille prérendue existe en `fr` et en `en` ;
 *  3. sinon (Server Action, route handler, où `next/root-params` n'est pas
 *     disponible) de la requête elle-même : la langue que le proxy a choisie,
 *     le cookie `NEXT_LOCALE`, puis `Accept-Language`.
 */
export default getRequestConfig(async ({ locale: explicit }) => {
  const locale = isLocale(explicit) ? explicit : await resolveLocale()
  return {
    locale,
    messages: MESSAGES[locale],
    timeZone: TIME_ZONE,
  }
})

async function resolveLocale(): Promise<Locale> {
  const fromRoute = await localeFromRoute()
  if (fromRoute) return fromRoute

  const [headerList, cookieStore] = await Promise.all([headers(), cookies()])
  const fromProxy = headerList.get(PROXY_LOCALE_HEADER)
  if (isLocale(fromProxy)) return fromProxy
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value
  if (isLocale(fromCookie)) return fromCookie
  return negotiateLocale(headerList.get('accept-language'))
}

async function localeFromRoute(): Promise<Locale | null> {
  try {
    const value: unknown = await rootLocale()
    return isLocale(value) ? value : null
  } catch {
    // Next refuse `next/root-params` dans une Server Action ou un route
    // handler : on retombe sur la requête, qui y est lisible.
    return null
  }
}
