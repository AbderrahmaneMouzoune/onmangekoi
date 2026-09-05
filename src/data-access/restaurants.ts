import type { Restaurant } from './models'
import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export const RESTAURANT_PAGE_SIZE = 20

export interface RestaurantPage {
  items: Restaurant[]
  hasMore: boolean
  nextOffset: number
}

/** Échappe les jokers ILIKE pour qu'une recherche « 100% » reste littérale. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export async function searchRestaurants(
  supabase: SupabaseClient<Database>,
  options: { query?: string; offset?: number; limit?: number } = {}
): Promise<RestaurantPage> {
  const limit = Math.min(Math.max(options.limit ?? RESTAURANT_PAGE_SIZE, 1), 50)
  const offset = Math.max(options.offset ?? 0, 0)
  const query = (options.query ?? '').trim()

  let request = supabase.from('restaurants').select()

  if (query) {
    const pattern = `%${escapeLike(query)}%`
    request = request.or(`name.ilike.${pattern},cuisine_type.ilike.${pattern}`)
  }

  const { data, error } = await request.order('name').range(offset, offset + limit)
  if (error) throw error

  const hasMore = data.length > limit
  const items = hasMore ? data.slice(0, limit) : data
  return { items, hasMore, nextOffset: offset + items.length }
}

export async function getRestaurantsByIds(
  supabase: SupabaseClient<Database>,
  ids: string[]
): Promise<Restaurant[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('restaurants').select().in('id', ids).order('name')
  if (error) throw error
  return data
}
