import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import { PublicPodiumFallback, PublicPodiumSection } from '@/components/session/public-podium'
import { getPublicResults } from '@/data-access/public-results'
import { parseResultsParam } from '@/domain/share'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ code }, t] = await Promise.all([params, getTranslations('metadata')])
  const parsed = parseResultsParam(code)
  const results = parsed ? await getPublicResults(parsed).catch(() => null) : null
  const winner = results?.decision ?? results?.podium[0]

  if (!results || !winner) return { title: t('titles.results'), robots: { index: false } }

  const values = { session: results.sessionName, restaurant: winner.restaurant_name }
  return {
    title: t('publicResults.title', values),
    // Une fois la décision posée, le lien annonce un déjeuner, plus un vote.
    description: results.decision
      ? t('publicResults.decided', values)
      : t('publicResults.voted', { ...values, count: results.participantCount }),
    // Le lien se partage, il ne s'indexe pas : le nom d'une session est celui
    // d'un groupe, il n'a rien à faire dans un moteur de recherche.
    robots: { index: false },
    openGraph: { type: 'article' },
  }
}

/**
 * Classement public : `/r/7K3M9P2QWX`. La seule page de session ouverte sans
 * pseudo — d'où un code dédié, distinct de celui de l'invitation.
 */
export default function PublicResultsPage({ params }: Props) {
  return (
    <Shell size="reading">
      <Suspense fallback={<PublicPodiumFallback />}>
        <PublicPodiumSection params={params} />
      </Suspense>
    </Shell>
  )
}
