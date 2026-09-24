import type { MyStats } from './models'
import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Statistiques personnelles, agrégées en base (`my_stats`).
 *
 * Le comptage se fait côté Postgres : ramener tous les votes pour les compter
 * ici obligerait à lire des lignes que la RLS ne montre pas — et n'a pas à
 * montrer. La RPC ne compte que les votes de son appelant.
 *
 * Elle renvoie toujours une ligne, zéros compris ; `null` ne devrait donc
 * jamais arriver, mais l'appelant traite ce cas comme « rien à afficher »,
 * ce qui est exactement l'écran d'un compte sans session.
 */
export async function getMyStats(supabase: SupabaseClient<Database>): Promise<MyStats | null> {
  const { data, error } = await supabase.rpc('my_stats')
  if (error) throw error
  return data[0] ?? null
}
