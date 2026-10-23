import { IdentifyProfile } from '@/components/analytics/analytics-provider'
import { getCurrentViewer } from '@/data-access/auth'

/**
 * Lit l'utilisateur courant pour l'identifier auprès de PostHog. Rendu sous
 * `<Suspense>` dans le layout : la lecture des cookies reste ainsi dans une
 * poche dynamique et ne rend pas dynamique la coquille de chaque route.
 */
export async function AnalyticsIdentity() {
  const user = await getCurrentViewer()

  return <IdentifyProfile profileId={user?.id ?? null} />
}
