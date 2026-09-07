import { getRestaurantIdsForLists } from '@/data-access/lists'
import { createSession } from '@/data-access/sessions'
import { AppError } from '@/domain/errors'
import { SESSION_RESTAURANTS_MIN } from '@/domain/schemas/session'

import type { Session } from '@/data-access/models'
import type { Database } from '@/data-access/models/database'
import type { CreateSessionInput } from '@/domain/schemas/session'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Résout les restaurants depuis les listes choisies + la sélection directe,
 * dédoublonne en conservant l'ordre, puis délègue à la RPC transactionnelle.
 * Le dédoublonnage précède le compte : deux fois le même resto n'en fait qu'un.
 */
export async function createSessionUseCase(
  supabase: SupabaseClient<Database>,
  input: CreateSessionInput
): Promise<Session> {
  const fromLists = await getRestaurantIdsForLists(supabase, input.listIds)
  const restaurantIds = [...new Set([...fromLists, ...input.restaurantIds])]

  // Dernier rempart côté serveur avant la RPC, qui refuse elle aussi : un seul
  // resto ferait une session impossible à lancer, donc impossible à créer.
  if (restaurantIds.length < SESSION_RESTAURANTS_MIN) {
    throw new AppError(`Sélectionne au moins ${SESSION_RESTAURANTS_MIN} restaurants.`)
  }

  return createSession(supabase, { name: input.name, restaurantIds })
}
