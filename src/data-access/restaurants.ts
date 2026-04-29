import type { List, Restaurant } from './models'
import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ListWithRestaurants = List & {
  list_restaurants: {
    restaurant_id: string
    restaurants: Restaurant
  }[]
}

export async function getRestaurants(supabase: SupabaseClient<Database>): Promise<Restaurant[]> {
  const { data, error } = await supabase.from('restaurants').select().order('name')
  if (error) throw error
  return data
}

export async function getListsByOwner(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<ListWithRestaurants[]> {
  const { data, error } = await supabase
    .from('lists')
    .select('*, list_restaurants(restaurant_id, restaurants(*))')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as ListWithRestaurants[]
}

export async function getRestaurantsByListIds(
  supabase: SupabaseClient<Database>,
  listIds: string[]
): Promise<Restaurant[]> {
  if (listIds.length === 0) return []

  const { data, error } = await supabase
    .from('list_restaurants')
    .select('restaurant_id, restaurants!inner(*)')
    .in('list_id', listIds)
  if (error) throw error

  const seen = new Set<string>()
  const restaurants: Restaurant[] = []
  for (const row of data) {
    const r = (row as { restaurants: Restaurant }).restaurants
    if (!seen.has(r.id)) {
      seen.add(r.id)
      restaurants.push(r)
    }
  }
  return restaurants
}
