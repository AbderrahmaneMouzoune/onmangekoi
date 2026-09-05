import { cache } from 'react'

import type { Profile } from './models'
import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Profil d'un utilisateur — mémoïsé par requête (en-tête + page partagent l'appel). */
export const getProfile = cache(
  async (supabase: SupabaseClient<Database>, userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase.from('profiles').select().eq('id', userId).maybeSingle()
    if (error) throw error
    return data
  }
)

export async function updatePseudo(
  supabase: SupabaseClient<Database>,
  userId: string,
  pseudo: string
): Promise<void> {
  const { error } = await supabase.from('profiles').update({ pseudo }).eq('id', userId)
  if (error) throw error
}
