import { Bricolage_Grotesque, Geist_Mono, Instrument_Sans } from 'next/font/google'
import { Suspense } from 'react'

import './globals.css'
import { AnalyticsIdentity } from '@/components/analytics/analytics-identity'
import { AnalyticsProvider } from '@/components/analytics/analytics-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { SITE_NAME, SITE_TAGLINE, siteUrl } from '@/lib/site'
import { cn } from '@/lib/utils'
import { VISIT_HINT_SCRIPT } from '@/lib/visit-hint'

import type { Metadata, Viewport } from 'next'

const fontDisplay = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-display',
  display: 'swap',
})

const fontSans = Instrument_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
})

const fontMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    'Créez une session, partagez un lien, chacun vote sur les restaurants et le classement tranche. Sans compte, en deux minutes.',
  applicationName: SITE_NAME,
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'fr_FR',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: 'Le groupe vote, le classement tranche. Sans compte, en deux minutes.',
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f3ee' },
    { media: '(prefers-color-scheme: dark)', color: '#151617' },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={cn(fontDisplay.variable, fontSans.variable, fontMono.variable)}
    >
      <body className="flex min-h-svh flex-col">
        {/* Avant le premier pixel : la forme de la dernière visite, pour que
            les silhouettes de chargement ne réservent que ce qui va venir. */}
        <script dangerouslySetInnerHTML={{ __html: VISIT_HINT_SCRIPT }} />
        <ThemeProvider>{children}</ThemeProvider>
        <AnalyticsProvider />
        <Suspense fallback={null}>
          <AnalyticsIdentity />
        </Suspense>
      </body>
    </html>
  )
}
