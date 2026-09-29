import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { isLocale, LOCALES, type Locale } from '@/i18n/config'
import { buildManifest } from '@/lib/pwa/manifest'

/**
 * `/manifest.webmanifest`, dans la langue que le proxy a choisie. Le
 * navigateur le demande sans cookie : c'est `Accept-Language` qui tranche en
 * pratique, et c'est bien la langue du téléphone qui compte pour le nom et la
 * description de l'app installée.
 *
 * Prérendu au build pour chaque langue : rien n'y dépend de la requête.
 */
export function generateStaticParams(): { locale: Locale }[] {
  return LOCALES.map((locale) => ({ locale }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = await getTranslations({ locale, namespace: 'metadata' })

  return Response.json(buildManifest({ locale, description: t('tagline') }), {
    headers: { 'Content-Type': 'application/manifest+json' },
  })
}
