import 'server-only'

import { cache } from 'react'

import { createServerClient } from '@/data-access/supabase/server'

import type { User } from '@supabase/supabase-js'

/**
 * Utilisateur courant, vérifié auprès du serveur Auth — une seule fois par
 * requête grâce à `react.cache` : l'en-tête, la page et `generateMetadata`
 * partagent le même appel réseau au lieu de le répéter.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})
