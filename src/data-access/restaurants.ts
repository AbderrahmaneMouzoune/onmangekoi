import { cacheLife, cacheTag } from 'next/cache'

import { createPublicClient } from '@/data-access/supabase/public'

import type { Restaurant } from './models'
import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export const RESTAURANT_PAGE_SIZE = 20

/** Tag de cache du catalogue : `revalidateTag` après un import de restaurants. */
export const RESTAURANTS_CACHE_TAG = 'restaurants'

export interface RestaurantPage {
  items: Restaurant[]
  hasMore: boolean
  nextOffset: number
}

export interface RestaurantSearchOptions {
  query?: string
  offset?: number
  limit?: number
}

/** Échappe les jokers ILIKE pour qu'une recherche « 100% » reste littérale. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export async function searchRestaurants(
  supabase: SupabaseClient<Database>,
  options: RestaurantSearchOptions = {}
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

/**
 * Page du catalogue de restaurants, mise en cache et partagée par tous.
 *
 * Le catalogue est public et bouge rarement : le lire par le client anonyme
 * (jamais celui lié aux cookies) permet de mémoriser le résultat pour tout le
 * monde au lieu de refaire un aller-retour Supabase à chaque rendu. C'est ce
 * qui rend les pages « nouvelle liste », « nouvelle session » et « liste
 * partagée » prérendables : leur formulaire n'attend plus la base.
 *
 * Les arguments font partie de la clé de cache — recherche et pagination du
 * `RestaurantPicker` en profitent donc aussi.
 */
export async function getRestaurantCatalogPage(
  options: RestaurantSearchOptions = {}
): Promise<RestaurantPage> {
  'use cache'
  cacheLife('hours')
  cacheTag(RESTAURANTS_CACHE_TAG)

  return searchRestaurants(createPublicClient(), options)
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
