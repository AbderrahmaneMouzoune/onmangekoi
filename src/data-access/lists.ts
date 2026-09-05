import { cache } from 'react'

import { parseListParam } from '@/domain/share'

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

async function findListWithRestaurants(
  supabase: SupabaseClient<Database>,
  column: 'id' | 'share_code',
  value: string
): Promise<ListWithRestaurants | null> {
  const { data, error } = await supabase
    .from('lists')
    .select('*, list_restaurants(added_at, restaurants(*))')
    .eq(column, value)
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

/** Liste avec ses restaurants — mémoïsée par requête (page + métadonnées). */
export const getListWithRestaurants = cache(
  async (supabase: SupabaseClient<Database>, listId: string): Promise<ListWithRestaurants | null> =>
    findListWithRestaurants(supabase, 'id', listId)
)

/** Idem, par code de partage : c'est lui qui identifie la liste dans l'URL. */
export const getListByShareCode = cache(
  async (
    supabase: SupabaseClient<Database>,
    shareCode: string
  ): Promise<ListWithRestaurants | null> =>
    findListWithRestaurants(supabase, 'share_code', shareCode)
)

/**
 * Liste visée par un paramètre d'URL : son code de partage aujourd'hui, un
 * uuid pour les liens d'avant. La RLS ne rend visible que les listes du
 * propriétaire, comme pour une lecture par id.
 */
export const getListByParam = cache(
  async (
    supabase: SupabaseClient<Database>,
    param: string
  ): Promise<ListWithRestaurants | null> => {
    const identifier = parseListParam(param)
    if (identifier.kind === 'invalid') return null
    return identifier.kind === 'id'
      ? getListWithRestaurants(supabase, identifier.value)
      : getListByShareCode(supabase, identifier.value)
  }
)

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

/** Renvoie la ligne à jour : son nom et son code composent l'URL lisible. */
export async function updateList(
  supabase: SupabaseClient<Database>,
  listId: string,
  patch: { name?: string; is_collaborative?: boolean }
): Promise<List> {
  const { data, error } = await supabase
    .from('lists')
    .update(patch)
    .eq('id', listId)
    .select()
    .single()
  if (error) throw error
  return data
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

// ─── Listes partagées ────────────────────────────────────────────
// `identifier` = code de partage Crockford (10) ou ancien token (32 hex).
// La résolution est faite en base par `find_list_by_share`.

/** Aperçu d'une liste partagée — mémoïsé par requête (page + métadonnées). */
export const getSharedListPreview = cache(
  async (
    supabase: SupabaseClient<Database>,
    identifier: string
  ): Promise<SharedListPreview | null> => {
    const { data, error } = await supabase.rpc('list_by_share_token', { p_token: identifier })
    if (error) throw error
    return data[0] ?? null
  }
)

export async function getSharedListRestaurants(
  supabase: SupabaseClient<Database>,
  identifier: string
): Promise<Restaurant[]> {
  const { data, error } = await supabase.rpc('list_restaurants_by_share_token', {
    p_token: identifier,
  })
  if (error) throw error
  return data
}

/** Vrai si la liste partagée appartient à l'utilisateur courant (vu par la RLS). */
export async function ownsSharedList(
  supabase: SupabaseClient<Database>,
  identifier: { kind: 'code' | 'token'; value: string }
): Promise<boolean> {
  const column = identifier.kind === 'code' ? 'share_code' : 'share_token'
  const { data, error } = await supabase
    .from('lists')
    .select('id')
    .eq(column, identifier.value)
    .maybeSingle()
  if (error) throw error
  return data !== null
}

export async function addRestaurantsToSharedList(
  supabase: SupabaseClient<Database>,
  identifier: string,
  restaurantIds: string[]
): Promise<void> {
  await Promise.all(
    restaurantIds.map(async (restaurantId) => {
      const { error } = await supabase.rpc('add_restaurant_to_shared_list', {
        p_token: identifier,
        p_restaurant_id: restaurantId,
      })
      if (error) throw error
    })
  )
}

export async function copySharedList(
  supabase: SupabaseClient<Database>,
  identifier: string,
  name?: string
): Promise<List> {
  const { data, error } = await supabase.rpc('copy_shared_list', {
    p_token: identifier,
    // Omettre la clé plutôt que passer `null` : le paramètre est déclaré
    // `default null` en base, donc l'absence produit exactement la même
    // valeur — et le type généré ne l'accepte plus que comme optionnel.
    p_name: name,
  })
  if (error) throw error
  return data
}
