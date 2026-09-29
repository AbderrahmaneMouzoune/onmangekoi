import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import '../globals.css'
import { fontClassNames } from '@/app/fonts'
import { AnalyticsIdentity } from '@/components/analytics/analytics-identity'
import { AnalyticsProvider } from '@/components/analytics/analytics-provider'
import { KeyboardShortcuts } from '@/components/layout/keyboard-shortcuts'
import { SkipLink } from '@/components/layout/skip-link'
import { PwaProvider } from '@/components/pwa/pwa-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { isLocale, LOCALES, OG_LOCALES, type Locale } from '@/i18n/config'
import { INSTALL_PROMPT_SCRIPT } from '@/lib/pwa/install-prompt'
import { SITE_NAME, siteUrl } from '@/lib/site'
import { VISIT_HINT_SCRIPT } from '@/lib/visit-hint'

import type { Metadata, Viewport } from 'next'

interface Props {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

/**
 * La langue est un paramètre de route (segment caché, voir
 * `i18n/routing.ts`) : chaque page est prérendue une fois par langue, et la
 * coquille statique reste servie depuis le cache.
 */
export function generateStaticParams(): { locale: Locale }[] {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'metadata' })
  const title = `${SITE_NAME} — ${t('tagline')}`

  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: title,
      template: `%s · ${SITE_NAME}`,
    },
    description: t('description'),
    applicationName: SITE_NAME,
    manifest: '/manifest.webmanifest',
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: OG_LOCALES[locale],
      alternateLocale: LOCALES.filter((other) => other !== locale).map(
        (other) => OG_LOCALES[other]
      ),
      title,
      description: t('ogDescription'),
    },
    twitter: {
      card: 'summary_large_image',
    },
    appleWebApp: {
      capable: true,
      title: SITE_NAME,
      statusBarStyle: 'default',
    },
    formatDetection: { telephone: false },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f3ee' },
    { media: '(prefers-color-scheme: dark)', color: '#151617' },
  ],
}

export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  return (
    <html lang={locale} suppressHydrationWarning className={fontClassNames}>
      <body className="flex min-h-svh flex-col">
        {/* Avant le premier pixel : la forme de la dernière visite, pour que
            les silhouettes de chargement ne réservent que ce qui va venir. */}
        <script dangerouslySetInnerHTML={{ __html: VISIT_HINT_SCRIPT }} />
        {/* L'invitation à installer l'app part souvent avant l'hydratation :
            on la retient dès maintenant (voir `lib/pwa/install-prompt.ts`). */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_SCRIPT }} />
        {/* Messages, langue et fuseau hérités de `i18n/request.ts` : les
            Client Components en ont besoin pour `useTranslations`. */}
        <NextIntlClientProvider>
          <SkipLink />
          <ThemeProvider>{children}</ThemeProvider>
          <KeyboardShortcuts />
          <AnalyticsProvider />
          <PwaProvider />
          <Suspense fallback={null}>
            <AnalyticsIdentity />
          </Suspense>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
