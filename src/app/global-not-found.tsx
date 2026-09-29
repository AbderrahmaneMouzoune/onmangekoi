import { RiRestaurant2Line } from '@remixicon/react'
import Link from 'next/link'
import { createTranslator } from 'next-intl'

import './globals.css'
import { fontClassNames } from '@/app/fonts'
import { Shell } from '@/components/layout/shell'
import { ThemeProvider } from '@/components/theme-provider'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { router } from '@/config/router.config'
import { DEFAULT_LOCALE, LOCALES } from '@/i18n/config'
import { MESSAGES } from '@/i18n/messages'
import { SITE_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'

import type { Metadata } from 'next'

/**
 * 404 des adresses qui ne correspondent à aucune route. Le proxy réécrit
 * toute URL vers `/<langue>/…` ; quand rien ne répond sous `app/[locale]`,
 * Next sert cette page, hors de tout layout — avec un vrai statut 404, ce
 * qu'une route attrape-tout sous `[locale]` ne permettrait pas avec le
 * prérendu partiel.
 *
 * Elle est statique : elle ne connaît pas la langue de la requête, alors elle
 * parle les deux. Le `notFound()` d'une page existante (liste inconnue…)
 * affiche, lui, `[locale]/not-found.tsx`, dans la langue du visiteur.
 */
const translators = LOCALES.map((locale) => ({
  locale,
  t: createTranslator({ locale, messages: MESSAGES[locale], namespace: 'layout.notFound' }),
  tCommon: createTranslator({ locale, messages: MESSAGES[locale], namespace: 'common.actions' }),
}))

export const metadata: Metadata = {
  title: `${translators.map(({ t }) => t('title')).join(' · ')} · ${SITE_NAME}`,
  robots: { index: false, follow: false },
}

export default function GlobalNotFound() {
  return (
    <html lang={DEFAULT_LOCALE} suppressHydrationWarning className={fontClassNames}>
      <body className="flex min-h-svh flex-col">
        <ThemeProvider>
          <Shell className="justify-center">
            {translators.map(({ locale, t, tCommon }) => (
              <div key={locale} lang={locale}>
                <EmptyState
                  icon={<RiRestaurant2Line />}
                  title={t('title')}
                  description={t('description')}
                  action={
                    <Link
                      href={router.home()}
                      className={cn(
                        buttonVariants({
                          variant: locale === DEFAULT_LOCALE ? 'default' : 'outline',
                        })
                      )}
                    >
                      {tCommon('backHome')}
                    </Link>
                  }
                />
              </div>
            ))}
          </Shell>
        </ThemeProvider>
      </body>
    </html>
  )
}
