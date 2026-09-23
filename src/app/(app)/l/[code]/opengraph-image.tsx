import { ImageResponse } from 'next/og'

import { OgCard } from '@/components/og/og-card'
import { getPublicList } from '@/data-access/public-lists'
import { parseSharedListParam } from '@/domain/share'
import { countLabel } from '@/lib/format'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Une liste de restos partagée sur onmangekoi'

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

export default async function SharedListOpenGraphImage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const identifier = parseSharedListParam(code)
  const preview =
    identifier.kind === 'invalid' ? null : await getPublicList(identifier.value).catch(() => null)

  const cuisines = preview?.cuisines.slice(0, 3).join(' · ')

  return new ImageResponse(
    preview ? (
      <OgCard
        eyebrow="Les bonnes adresses"
        title={preview.name}
        subtitle={`${countLabel(preview.restaurant_count, 'resto')}${cuisines ? ` · ${cuisines}` : ''}`}
        footer={
          preview.top_restaurant
            ? `Le plus souvent choisi : ${preview.top_restaurant}`
            : 'Sans compte'
        }
      />
    ) : (
      // Liste privée ou lien mort : l'image ne dit rien de plus que la page.
      <OgCard
        eyebrow="Liste partagée"
        title="Où est-ce qu’on mange ?"
        subtitle="Une liste de restos à départager en deux minutes."
      />
    ),
    { ...size, headers: { 'cache-control': CACHE_CONTROL } }
  )
}
