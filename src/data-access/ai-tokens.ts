import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Un jeton tel que sa propriétaire le voit : jamais le jeton lui-même. */
export interface ApiTokenSummary {
  id: string
  label: string
  token_hint: string
  created_at: string
  last_used_at: string | null
}

/** Jeton fraîchement créé : la seule fois où il existe en clair. */
export interface CreatedApiToken extends ApiTokenSummary {
  token: string
}

export async function getMyApiTokens(
  supabase: SupabaseClient<Database>
): Promise<ApiTokenSummary[]> {
  const { data, error } = await supabase
    .from('api_tokens')
    .select('id, label, token_hint, created_at, last_used_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createApiToken(
  supabase: SupabaseClient<Database>,
  label: string
): Promise<CreatedApiToken> {
  const { data, error } = await supabase.rpc('create_api_token', { p_label: label })
  if (error) throw error
  const row = data[0]
  return { ...row, last_used_at: null }
}

/** La RLS ne laisse supprimer que ses propres jetons. */
export async function revokeApiToken(
  supabase: SupabaseClient<Database>,
  tokenId: string
): Promise<void> {
  const { error } = await supabase.from('api_tokens').delete().eq('id', tokenId)
  if (error) throw error
}
