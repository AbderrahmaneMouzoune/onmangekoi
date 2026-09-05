import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { env } from '@/env'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

let publicClient: SupabaseClient<Database> | undefined

/**
 * Client Supabase public : clé publiable, aucun cookie, aucune session.
 *
 * Il ne sert qu'aux données identiques pour tout le monde — aujourd'hui le
 * catalogue de restaurants, seule table lisible par le rôle `anon`
 * (`restaurants_select_public`). Ne dépendant d'aucune requête, il peut vivre
 * dans un cache partagé (`use cache`) sans jamais mélanger deux utilisateurs :
 * un client lié aux cookies, lui, produirait un résultat par personne.
 *
 * Singleton de module : la connexion PostgREST est sans état, on évite
 * simplement de réinstancier le client à chaque appel.
 */
export function createPublicClient(): SupabaseClient<Database> {
  publicClient ??= createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  return publicClient
}
