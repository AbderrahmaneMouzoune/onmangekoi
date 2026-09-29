'use server'

import { cookies } from 'next/headers'

import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/i18n/config'
import { translateError } from '@/i18n/server'

import type { ActionResult } from './types'

/**
 * Retient la langue choisie dans le sélecteur (issue #14). Le proxy lit ce
 * cookie avant `Accept-Language` : c'est lui qui décide de la langue des
 * visites suivantes. Le navigateur recharge ensuite la page, pour repasser
 * par le proxy — un simple rafraîchissement du routeur resterait dans la
 * langue de la requête en cours.
 *
 * Aucun compte requis : la langue est une préférence d'appareil, comme le
 * thème.
 */
export async function setLocaleAction(locale: string): Promise<ActionResult> {
  if (!isLocale(locale)) return { ok: false, error: await translateError(null) }

  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  })
  return { ok: true, data: undefined }
}
