import { cacheLife, cacheTag } from 'next/cache'

import { createPublicClient } from '@/data-access/supabase/public'

import type { PublicResults } from './models'

/**
 * Le classement tel qu'on le sert derrière `/r/<code>`, à qui n'a pas de
 * pseudo et n'a jamais mis les pieds dans la session.
 *
 * Son propre module, et pas `sessions.ts`, pour deux raisons : cette lecture
 * ne passe jamais par le client lié aux cookies — donc jamais par la RLS —,
 * et le client anonyme est `server-only`, ce qui contaminerait tout ce qui
 * importe la couche session.
 */

/**
 * Profil de durée du classement public, et son tag. `revalidateTag` exige les
 * deux : ils décrivent la même entrée de cache et doivent bouger ensemble.
 * `hours` revalide à l'heure — c'est ce qui tient l'image Open Graph, la plus
 * coûteuse à produire, sans la figer quand le host referme le lien.
 */
export const PUBLIC_RESULTS_CACHE_PROFILE = 'hours'

export function publicResultsCacheTag(code: string): string {
  return `public-results:${code}`
}

/**
 * Le podium derrière un code public, ou `null` si le lien ne mène nulle part
 * — code inconnu, session encore ouverte, ou partage que le host n'a pas
 * activé. La RPC tranche : ici, on ne fait que remettre en forme.
 *
 * Mise en cache et partagée par tout le monde : la page comme l'image Open
 * Graph la lisent, et un lien collé dans une conversation de groupe est
 * ouvert par des dizaines de personnes à la fois. Le client anonyme rend
 * cette mutualisation possible — un client lié aux cookies produirait un
 * résultat par visiteur.
 */
export async function getPublicResults(code: string): Promise<PublicResults | null> {
  'use cache'
  cacheLife(PUBLIC_RESULTS_CACHE_PROFILE)
  cacheTag(publicResultsCacheTag(code))

  const { data, error } = await createPublicClient().rpc('public_results', { p_code: code })
  if (error) throw error

  const [first] = data
  if (!first) return null

  return {
    sessionName: first.session_name,
    closedAt: first.closed_at,
    participantCount: first.participant_count,
    // Les colonnes de session se répètent sur chaque ligne du podium : on ne
    // les recopie pas dans les lignes.
    podium: data.map(
      ({ session_name: _name, closed_at: _closed, participant_count: _count, ...row }) => row
    ),
  }
}
