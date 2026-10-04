import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { env } from '@/env'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

let adminClient: SupabaseClient<Database> | undefined

/**
 * Client Supabase à clé secrète : il passe outre la RLS. Aucun cookie, aucune
 * session — il n'agit au nom de personne.
 *
 * Réservé à ce qui ne peut pas se faire au nom de l'utilisateur courant,
 * parce qu'il n'y en a pas : aujourd'hui la seule route d'envoi des
 * notifications push, appelée par la base, qui lit les abonnements des
 * participants d'une session. Tout le reste passe par `createServerClient`
 * et la RLS.
 *
 * `null` sans `SUPABASE_SECRET_KEY` : l'appelant se tait au lieu d'échouer.
 */
export function createAdminClient(): SupabaseClient<Database> | null {
  const secret = env.SUPABASE_SECRET_KEY
  if (!secret) return null

  adminClient ??= createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return adminClient
}
