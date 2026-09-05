import { addRestaurantsToList, createList } from '@/data-access/lists'

import type { List } from '@/data-access/models'
import type { Database } from '@/data-access/models/database'
import type { CreateListInput } from '@/domain/schemas/list'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Une liste se crée en deux écritures : la liste, puis son contenu initial.
 * `addRestaurantsToList` ignore un tableau vide — une liste peut naître vide.
 */
export async function createListUseCase(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  input: CreateListInput
): Promise<List> {
  const list = await createList(supabase, { name: input.name, ownerId })
  await addRestaurantsToList(supabase, list.id, input.restaurantIds)
  return list
}
