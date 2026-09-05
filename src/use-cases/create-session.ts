import { getRestaurantIdsForLists } from '@/data-access/lists'
import { createSession } from '@/data-access/sessions'
import { AppError } from '@/domain/errors'

import type { Session } from '@/data-access/models'
import type { Database } from '@/data-access/models/database'
import type { CreateSessionInput } from '@/domain/schemas/session'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Résout les restaurants depuis les listes choisies + la sélection directe,
 * dédoublonne en conservant l'ordre, puis délègue à la RPC transactionnelle.
 */
export async function createSessionUseCase(
  supabase: SupabaseClient<Database>,
  input: CreateSessionInput
): Promise<Session> {
  const fromLists = await getRestaurantIdsForLists(supabase, input.listIds)
  const restaurantIds = [...new Set([...fromLists, ...input.restaurantIds])]

  if (restaurantIds.length === 0) {
    throw new AppError('Sélectionne au moins un restaurant.')
  }

  return createSession(supabase, { name: input.name, restaurantIds })
}
