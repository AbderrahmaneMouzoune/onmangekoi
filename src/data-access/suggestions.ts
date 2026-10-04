import type { SuggestedRestaurantRow } from './models'
import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Sélection proposée à l'ouverture de « Nouvelle session » : les restaurants
 * vus récemment par la personne connectée, sans les gagnants récents, plus un
 * jamais proposé. Vide sans historique.
 *
 * Une seule requête, restaurants compris : le panier affiche les pré-cochés
 * sans aller les chercher un par un. Comme `recent_winners`, la RPC ne prend
 * pas d'identifiant et répond pour `auth.uid()`.
 */
export async function getRestaurantSuggestions(
  supabase: SupabaseClient<Database>,
  limit: number
): Promise<SuggestedRestaurantRow[]> {
  const { data, error } = await supabase.rpc('suggest_restaurants', { p_limit: limit })
  if (error) throw error
  return data as SuggestedRestaurantRow[]
}
