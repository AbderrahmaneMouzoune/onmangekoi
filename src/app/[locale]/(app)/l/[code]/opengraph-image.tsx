import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'

import { OgCard } from '@/components/og/og-card'
import { getPublicList } from '@/data-access/public-lists'
import { parseSharedListParam } from '@/domain/share'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config'

const size = { width: 1200, height: 630 }
const contentType = 'image/png'

interface Props {
  params: Promise<{ locale: string; code: string }>
}

/** La langue vient de l'URL de l'image, dérivée de la page partagée. */
async function localeOf(params: Props['params']) {
  const { locale } = await params
  return isLocale(locale) ? locale : DEFAULT_LOCALE
}

/**
 * Le texte alternatif suit la langue : il faut passer par
 * `generateImageMetadata`, ce qui fait de l'image une route prérendue à la
 * demande — elle ne peut plus lire de cookie. Aucun problème ici : les données
 * viennent de `getPublicList`, lue par le client anonyme et mise en cache,
 * exactement ce que voit le robot d'aperçu.
 */
export async function generateImageMetadata({ params }: Props) {
  const t = await getTranslations({ locale: await localeOf(params), namespace: 'og.list' })
  return [{ id: 'list', alt: t('alt'), size, contentType }]
}

/**
 * L'aperçu que Slack ou WhatsApp affichent sous le lien d'une liste publique.
 *
 * Une heure de cache : les données viennent de `getPublicList`, mémorisée sur
 * le profil `hours`, et la réponse porte le même délai pour les robots
 * d'aperçu qui, eux, ne repasseront jamais par notre cache. Refermer le
 * partage purge l'entrée (`updateTag`) : la page redevient une page
 * privée tout de suite, seuls les aperçus déjà collés dans une conversation
 * gardent l'image — comme toute vignette déjà envoyée.
 */
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'

export default async function SharedListOpenGraphImage({ params }: Props) {
  const [{ code }, locale] = await Promise.all([params, localeOf(params)])
  const t = await getTranslations({ locale, namespace: 'og.list' })
  const identifier = parseSharedListParam(code)
  const preview =
    identifier.kind === 'invalid' ? null : await getPublicList(identifier.value).catch(() => null)

  // Les cuisines sont des données du carnet (écrites en français) : elles
  // passent telles quelles, seul le séparateur est posé ici.
  const cuisines = preview?.cuisines.slice(0, 3).join(' · ')

  return new ImageResponse(
    preview ? (
      <OgCard
        eyebrow={t('eyebrow')}
        title={preview.name}
        subtitle={
          cuisines
            ? t('subtitleWithCuisines', { count: preview.restaurant_count, cuisines })
            : t('subtitle', { count: preview.restaurant_count })
        }
        footer={
          preview.top_restaurant ? t('top', { restaurant: preview.top_restaurant }) : t('footer')
        }
      />
    ) : (
      // Liste privée ou lien mort : l'image ne dit rien de plus que la page.
      <OgCard
        eyebrow={t('fallbackEyebrow')}
        title={t('fallbackTitle')}
        subtitle={t('fallbackSubtitle')}
      />
    ),
    { ...size, headers: { 'cache-control': CACHE_CONTROL } }
  )
}
