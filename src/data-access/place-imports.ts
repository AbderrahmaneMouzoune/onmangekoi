import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Quota d'amorçage du quartier.
 *
 * Amorcer importe vingt restos d'un coup à partir d'une seule recherche
 * Google — donc d'un appel facturé. Le créneau se prend en base avant
 * l'appel : la RPC compte les amorçages de l'appelant sur sa fenêtre, refuse
 * au-delà du quota (`omk:neighbourhood_quota_reached`) et renvoie ce qu'il
 * en reste. Le plafond et la fenêtre vivent en base, jamais ici.
 */
export async function claimNeighbourhoodImport(
  supabase: SupabaseClient<Database>
): Promise<number> {
  const { data, error } = await supabase.rpc('claim_neighbourhood_import')
  if (error) throw error
  return data
}
