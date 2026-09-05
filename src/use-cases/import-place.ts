import { getPlaceDetails } from '@/data-access/places'
import { upsertRestaurantFromPlace } from '@/data-access/restaurants'
import { AppError } from '@/domain/errors'

import type { Restaurant } from '@/data-access/models'
import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Importer un lieu Google se fait en deux temps : relire la fiche chez Google
 * (servie par le cache de la recherche la plupart du temps), puis l'écrire en
 * base via une RPC idempotente sur `place_id`.
 *
 * L'appelant ne fournit qu'un identifiant : aucun des champs enregistrés ne
 * vient du navigateur.
 */
export async function importPlaceUseCase(
  supabase: SupabaseClient<Database>,
  placeId: string
): Promise<Restaurant> {
  const place = await getPlaceDetails(placeId)
  if (!place) throw new AppError('Ce lieu n’existe plus chez Google.')

  return upsertRestaurantFromPlace(supabase, place)
}
