import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'

import { OgCard } from '@/components/og/og-card'
import { getPublicResults } from '@/data-access/public-results'
import { parseResultsParam } from '@/domain/share'
import { formatScore } from '@/domain/vote'
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

/** Le texte alternatif suit la langue : il faut passer par `generateImageMetadata`. */
export async function generateImageMetadata({ params }: Props) {
  const t = await getTranslations({ locale: await localeOf(params), namespace: 'og.results' })
  return [{ id: 'results', alt: t('alt'), size, contentType }]
}

/**
 * Aperçu du podium, celui que Slack ou WhatsApp affichent sous le lien.
 *
 * Une heure de cache : les données viennent de `getPublicResults`, mémorisées
 * sur le profil `hours`, et la réponse porte le même délai pour les robots
 * d'aperçu qui, eux, ne repasseront jamais par notre cache. Refermer le
 * partage purge l'entrée (`revalidateTag`) : la page redevient introuvable
 * tout de suite, seuls les aperçus déjà collés dans une conversation gardent
 * l'image — comme toute vignette déjà envoyée.
 */
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'

export default async function PublicResultsOpenGraphImage({ params }: Props) {
  const [{ code }, locale] = await Promise.all([params, localeOf(params)])
  const t = await getTranslations({ locale, namespace: 'og.results' })
  const parsed = parseResultsParam(code)
  const results = parsed ? await getPublicResults(parsed).catch(() => null) : null
  // La décision du host, quand elle existe, passe avant le premier du vote.
  const winner = results?.decision ?? results?.podium[0]

  return new ImageResponse(
    results && winner ? (
      <OgCard
        eyebrow={results.decision ? t('decided') : t('winner')}
        title={winner.restaurant_name}
        subtitle={t('subtitle', {
          score: formatScore(winner.score),
          count: results.participantCount,
        })}
        footer={results.sessionName}
      />
    ) : (
      <OgCard
        eyebrow={t('fallbackEyebrow')}
        title={t('fallbackTitle')}
        subtitle={t('fallbackSubtitle')}
      />
    ),
    { ...size, headers: { 'cache-control': CACHE_CONTROL } }
  )
}
