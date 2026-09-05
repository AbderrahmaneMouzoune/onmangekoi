import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Forme du JSON renvoyé par `public.export_my_data()`. La RPC est typée `Json`
 * par le générateur Supabase : ce type documente le contrat côté application
 * et évite de manipuler du `any` dans le Route Handler.
 */
export interface AccountExport {
  format_version: number
  exported_at: string
  account: {
    id: string
    email: string | null
    is_anonymous: boolean
    created_at: string | null
    last_sign_in_at: string | null
  } | null
  profile: { pseudo: string | null; created_at: string; updated_at: string } | null
  lists: {
    id: string
    name: string
    is_collaborative: boolean
    share_code: string
    created_at: string
    restaurants: { id: string; name: string; added_at: string }[]
  }[]
  hosted_sessions: {
    id: string
    name: string
    status: string
    invite_code: string
    created_at: string
    launched_at: string | null
    closed_at: string | null
    participant_count: number
  }[]
  participations: {
    session_id: string
    session_name: string
    status: string
    is_host: boolean
    joined_at: string
    has_finished_voting: boolean
    votes: { restaurant: string; value: number; label: string; created_at: string }[]
  }[]
}

/** Portabilité (art. 20 RGPD) : la base assemble le JSON, filtré sur `auth.uid()`. */
export async function exportMyData(supabase: SupabaseClient<Database>): Promise<AccountExport> {
  const { data, error } = await supabase.rpc('export_my_data')
  if (error) throw error
  return data as unknown as AccountExport
}

/**
 * Effacement (art. 17 RGPD). Tout se joue en base dans une seule transaction :
 * anonymisation des votes déjà agrégés, suppression du reste, puis du compte
 * d'authentification. Après cet appel la session courante ne vaut plus rien —
 * l'appelant doit se déconnecter.
 */
export async function deleteMyAccount(supabase: SupabaseClient<Database>): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw error
}
