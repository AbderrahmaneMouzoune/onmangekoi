import 'server-only'

import { cache } from 'react'

import { createServerClient } from '@/data-access/supabase/server'

import type { User } from '@supabase/supabase-js'

/**
 * Utilisateur courant, vérifié auprès du serveur Auth — une seule fois par
 * requête grâce à `react.cache` : l'en-tête, la page et `generateMetadata`
 * partagent le même appel réseau au lieu de le répéter.
 *
 * Réservé à ce qui a besoin de la fiche complète (email, confirmation) ou
 * d'une vérification qui voit une session révoquée : les Server Actions, les
 * routes, la page compte. Pour savoir *qui* regarde la page, `getCurrentViewer`.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/** Qui regarde la page : de quoi lire ses données sous RLS et adapter l'affichage. */
export interface Viewer {
  id: string
  is_anonymous: boolean
}

/**
 * Personne courante, lue dans son jeton plutôt que demandée au serveur Auth.
 *
 * `getClaims` vérifie la signature du JWT sur place quand le projet signe avec
 * des clés asymétriques (le cas en production, ES256) : aucun aller-retour
 * réseau, là où `getUser` en coûtait un à chaque rendu — en-tête, accueil,
 * salle de session. Avec une clé symétrique (stack locale), il retombe
 * lui-même sur le serveur Auth. La base, elle, revérifie le jeton à chaque
 * requête sous RLS.
 */
export const getCurrentViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createServerClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null
  return { id: claims.sub, is_anonymous: Boolean(claims.is_anonymous) }
})
