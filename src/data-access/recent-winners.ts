import { cache } from 'react'

import type { RecentWinner } from './models'
import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Restaurants qui ont gagné une session close récente à laquelle la personne
 * connectée a participé, avec la date du dernier sacre.
 *
 * La RPC ne prend pas d'identifiant : elle répond pour `auth.uid()` et pour
 * lui seul. Mémoïsée par requête — la page de création et le salon la lisent
 * chacun une fois, et la carte de vote n'y revient jamais.
 */
export const getRecentWinners = cache(
  async (supabase: SupabaseClient<Database>): Promise<RecentWinner[]> => {
    const { data, error } = await supabase.rpc('recent_winners')
    if (error) throw error
    return data
  }
)
