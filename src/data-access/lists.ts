import type {
  List,
  ListSummary,
  ListWithRestaurants,
  Restaurant,
  SharedListPreview,
} from './models'
import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getListsByOwner(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<ListSummary[]> {
  const { data, error } = await supabase
    .from('lists')
    .select('*, list_restaurants(count)')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })
  if (error) throw error

  return data.map(({ list_restaurants, ...list }) => ({
    ...list,
    restaurant_count: list_restaurants[0]?.count ?? 0,
  }))
}

export async function getListWithRestaurants(
  supabase: SupabaseClient<Database>,
  listId: string
): Promise<ListWithRestaurants | null> {
  const { data, error } = await supabase
    .from('lists')
    .select('*, list_restaurants(added_at, restaurants(*))')
    .eq('id', listId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const { list_restaurants, ...list } = data
  const restaurants = [...list_restaurants]
    .sort((a, b) => a.added_at.localeCompare(b.added_at))
    .map((row) => row.restaurants)
    .filter((restaurant): restaurant is Restaurant => restaurant !== null)

  return { ...list, restaurants }
}

/** Ids de restaurants contenus dans les listes données (dédoublonnés, ordre d'ajout). */
export async function getRestaurantIdsForLists(
  supabase: SupabaseClient<Database>,
  listIds: string[]
): Promise<string[]> {
  if (listIds.length === 0) return []
  const { data, error } = await supabase
    .from('list_restaurants')
    .select('restaurant_id, added_at')
    .in('list_id', listIds)
    .order('added_at')
  if (error) throw error

  const seen = new Set<string>()
  const ids: string[] = []
  for (const row of data) {
    if (!seen.has(row.restaurant_id)) {
      seen.add(row.restaurant_id)
      ids.push(row.restaurant_id)
    }
  }
  return ids
}

export async function createList(
  supabase: SupabaseClient<Database>,
  input: { name: string; ownerId: string }
): Promise<List> {
  const { data, error } = await supabase
    .from('lists')
    .insert({ name: input.name, owner_id: input.ownerId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateList(
  supabase: SupabaseClient<Database>,
  listId: string,
  patch: { name?: string; is_collaborative?: boolean }
): Promise<void> {
  const { error } = await supabase.from('lists').update(patch).eq('id', listId)
  if (error) throw error
}

export async function deleteList(
  supabase: SupabaseClient<Database>,
  listId: string
): Promise<void> {
  const { error } = await supabase.from('lists').delete().eq('id', listId)
  if (error) throw error
}

export async function addRestaurantsToList(
  supabase: SupabaseClient<Database>,
  listId: string,
  restaurantIds: string[]
): Promise<void> {
  if (restaurantIds.length === 0) return
  const rows = restaurantIds.map((restaurantId) => ({
    list_id: listId,
    restaurant_id: restaurantId,
  }))
  const { error } = await supabase
    .from('list_restaurants')
    .upsert(rows, { onConflict: 'list_id,restaurant_id', ignoreDuplicates: true })
  if (error) throw error
}

export async function removeRestaurantFromList(
  supabase: SupabaseClient<Database>,
  listId: string,
  restaurantId: string
): Promise<void> {
  const { error } = await supabase
    .from('list_restaurants')
    .delete()
    .eq('list_id', listId)
    .eq('restaurant_id', restaurantId)
  if (error) throw error
}

// ─── Listes partagées (RPC, token = droit d'accès) ──────────────

export async function getSharedListPreview(
  supabase: SupabaseClient<Database>,
  token: string
): Promise<SharedListPreview | null> {
  const { data, error } = await supabase.rpc('list_by_share_token', { p_token: token })
  if (error) throw error
  return data[0] ?? null
}

export async function getSharedListRestaurants(
  supabase: SupabaseClient<Database>,
  token: string
): Promise<Restaurant[]> {
  const { data, error } = await supabase.rpc('list_restaurants_by_share_token', {
    p_token: token,
  })
  if (error) throw error
  return data
}

export async function addRestaurantToSharedList(
  supabase: SupabaseClient<Database>,
  token: string,
  restaurantId: string
): Promise<void> {
  const { error } = await supabase.rpc('add_restaurant_to_shared_list', {
    p_token: token,
    p_restaurant_id: restaurantId,
  })
  if (error) throw error
}

export async function copySharedList(
  supabase: SupabaseClient<Database>,
  token: string,
  name?: string
): Promise<List> {
  const { data, error } = await supabase.rpc('copy_shared_list', {
    p_token: token,
    p_name: name ?? null,
  })
  if (error) throw error
  return data
}

/** Listes du propriétaire avec les ids de restaurants (formulaire de session). */
export type ListWithRestaurantIds = List & { restaurant_ids: string[] }

export async function getListsWithRestaurantIds(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<ListWithRestaurantIds[]> {
  const { data, error } = await supabase
    .from('lists')
    .select('*, list_restaurants(restaurant_id)')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })
  if (error) throw error

  return data.map(({ list_restaurants, ...list }) => ({
    ...list,
    restaurant_ids: list_restaurants.map((row) => row.restaurant_id),
  }))
}
