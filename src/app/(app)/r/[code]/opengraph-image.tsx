import { ImageResponse } from 'next/og'

import { OgCard } from '@/components/og/og-card'
import { getPublicResults } from '@/data-access/public-results'
import { parseResultsParam } from '@/domain/share'
import { formatScore } from '@/domain/vote'
import { countLabel } from '@/lib/format'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Le classement d’un vote onmangekoi'

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

export default async function PublicResultsOpenGraphImage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const parsed = parseResultsParam(code)
  const results = parsed ? await getPublicResults(parsed).catch(() => null) : null
  const winner = results?.podium[0]

  return new ImageResponse(
    results && winner ? (
      <OgCard
        eyebrow="On mange chez"
        title={winner.restaurant_name}
        subtitle={`Score ${formatScore(winner.score)} · ${countLabel(results.participantCount, 'participant')}`}
        footer={results.sessionName}
      />
    ) : (
      <OgCard
        eyebrow="Classement"
        title="Où est-ce qu’on mange ?"
        subtitle="Le groupe vote, le classement tranche."
      />
    ),
    { ...size, headers: { 'cache-control': CACHE_CONTROL } }
  )
}
