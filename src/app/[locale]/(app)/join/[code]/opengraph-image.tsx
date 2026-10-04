import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'

import { OgCard } from '@/components/og/og-card'
import { getPublicSessionPreview } from '@/data-access/public-invitations'
import { isDuoSession, isOpenSession, parseSessionRules } from '@/domain/session-rules'
import { parseInviteIdentifier } from '@/domain/share'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config'
import { displayPseudo } from '@/lib/format'

const size = { width: 1200, height: 630 }
const contentType = 'image/png'

interface Props {
  params: Promise<{ locale: string; code: string }>
}

/**
 * L'image est une route à part, hors du proxy : sa langue vient de son URL
 * (`/<langue>/join/<code>/opengraph-image/…`), que Next dérive de la page
 * partagée. Le texte alternatif la suit, d'où `generateImageMetadata`.
 */
async function localeOf(params: Props['params']) {
  const { locale } = await params
  return isLocale(locale) ? locale : DEFAULT_LOCALE
}

export async function generateImageMetadata({ params }: Props) {
  const t = await getTranslations({ locale: await localeOf(params), namespace: 'og.invite' })
  return [{ id: 'invite', alt: t('alt'), size, contentType }]
}

export default async function InviteOpenGraphImage({ params }: Props) {
  const [{ code }, locale] = await Promise.all([params, localeOf(params)])
  const [t, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: 'og.invite' }),
    getTranslations({ locale, namespace: 'common' }),
  ])
  const identifier = parseInviteIdentifier(code)
  const preview =
    identifier.kind === 'invalid'
      ? null
      : await getPublicSessionPreview(identifier.value).catch(() => null)

  if (!preview) {
    return new ImageResponse(
      <OgCard
        eyebrow={t('fallbackEyebrow')}
        title={t('fallbackTitle')}
        subtitle={t('fallbackSubtitle')}
      />,
      size
    )
  }

  const rules = parseSessionRules(preview.rules)
  const count = preview.restaurant_count
  return new ImageResponse(
    <OgCard
      eyebrow={t('eyebrow', { host: displayPseudo(preview.host_pseudo, tCommon('people.guest')) })}
      title={preview.name}
      subtitle={
        // Une session ouverte se partage dans la conversation, et chacun la
        // découvre à son heure : la carte dit qu'il n'y a pas de rendez-vous.
        // Un duo (#61) s'envoie à une seule personne : la carte dit la règle.
        isDuoSession(rules)
          ? t('duo', { count })
          : isOpenSession(rules)
            ? t('open', { count })
            : t('default', { count })
      }
      footer={t('footer')}
    />,
    size
  )
}
