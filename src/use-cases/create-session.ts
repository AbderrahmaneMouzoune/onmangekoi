import { getRestaurantsByListIds } from '@/data-access/restaurants'
import {
  createSession,
  createSessionRestaurants,
  createHostParticipant,
} from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase'

import type { Session } from '@/data-access/models/database'
import type { CreateSessionInput } from '@/lib/schemas/session'

export type CreateSessionResult = {
  session: Session
}

export async function createSessionUseCase(
  userId: string,
  input: CreateSessionInput
): Promise<CreateSessionResult> {
  const supabase = await createServerClient()

  // Résolution des restos depuis les listes + sélection directe, avec déduplication
  const fromLists = await getRestaurantsByListIds(supabase, input.listIds)
  const allRestaurantIds = [...new Set([...fromLists.map((r) => r.id), ...input.restaurantIds])]

  if (allRestaurantIds.length === 0) {
    throw new Error('La session doit contenir au moins un restaurant')
  }

  const session = await createSession(supabase, { name: input.name, hostId: userId })
  await createSessionRestaurants(supabase, session.id, allRestaurantIds)
  await createHostParticipant(supabase, session.id, userId)

  return { session }
}
