import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'

import { OgCard } from '@/components/og/og-card'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config'
import { SITE_NAME } from '@/lib/brand'

const size = { width: 1200, height: 630 }
const contentType = 'image/png'

interface Props {
  params: Promise<{ locale: string }>
}

/**
 * L'image est une route à part, hors du proxy : sa langue vient de son URL
 * (`/<langue>/opengraph-image/…`), que Next dérive de la page partagée.
 */
async function localeOf(params: Props['params']) {
  const { locale } = await params
  return isLocale(locale) ? locale : DEFAULT_LOCALE
}

/** Le texte alternatif suit la langue : il faut passer par `generateImageMetadata`. */
export async function generateImageMetadata({ params }: Props) {
  const t = await getTranslations({ locale: await localeOf(params), namespace: 'metadata' })
  return [{ id: 'default', alt: `${SITE_NAME} — ${t('tagline')}`, size, contentType }]
}

export default async function OpenGraphImage({ params }: Props) {
  const t = await getTranslations({ locale: await localeOf(params), namespace: 'og' })
  return new ImageResponse(
    <OgCard
      eyebrow={t('home.eyebrow')}
      title={t('home.title')}
      subtitle={t('home.subtitle')}
      footer={t('home.footer')}
    />,
    size
  )
}
