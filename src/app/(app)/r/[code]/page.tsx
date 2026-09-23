import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import { PublicPodiumFallback, PublicPodiumSection } from '@/components/session/public-podium'
import { getPublicResults } from '@/data-access/public-results'
import { parseResultsParam } from '@/domain/share'
import { countLabel } from '@/lib/format'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  const parsed = parseResultsParam(code)
  const results = parsed ? await getPublicResults(parsed).catch(() => null) : null
  const winner = results?.podium[0]

  if (!results || !winner) return { title: 'Classement', robots: { index: false } }

  return {
    title: `On mange chez ${winner.restaurant_name}`,
    description: `${results.sessionName} : ${countLabel(results.participantCount, 'participant')} ont voté, ${winner.restaurant_name} l’emporte.`,
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
    <Shell wide>
      <Suspense fallback={<PublicPodiumFallback />}>
        <PublicPodiumSection params={params} />
      </Suspense>
    </Shell>
  )
}
