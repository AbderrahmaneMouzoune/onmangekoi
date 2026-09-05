import { cacheLife, cacheTag } from 'next/cache'

import { createPublicClient } from '@/data-access/supabase/public'

import type { Restaurant } from './models'
import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export const RESTAURANT_PAGE_SIZE = 20

/** Tag de cache du catalogue : `revalidateTag` après un import de restaurants. */
export const RESTAURANTS_CACHE_TAG = 'restaurants'
/**
 * Profil de durée du catalogue. Exporté avec le tag parce que `revalidateTag`
 * en exige un : les deux décrivent la même entrée de cache et doivent bouger
 * ensemble.
 */
export const RESTAURANTS_CACHE_PROFILE = 'hours'

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
  cacheLife(RESTAURANTS_CACHE_PROFILE)
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

/** Ajout manuel — la RPC force `created_by` et `source = 'manual'` en base. */
export async function createManualRestaurant(
  supabase: SupabaseClient<Database>,
  input: {
    name: string
    cuisineType?: string | null
    address?: string | null
    city?: string | null
    priceLevel?: number | null
  }
): Promise<Restaurant> {
  const { data, error } = await supabase.rpc('create_manual_restaurant', {
    p_name: input.name,
    p_cuisine_type: input.cuisineType ?? undefined,
    p_address: input.address ?? undefined,
    p_city: input.city ?? undefined,
    p_price_level: input.priceLevel ?? undefined,
  })
  if (error) throw error
  return data
}

/** Restaurants au nom proche — déduplication souple, purement indicative. */
export async function findSimilarRestaurants(
  supabase: SupabaseClient<Database>,
  name: string,
  limit = 3
): Promise<Restaurant[]> {
  const { data, error } = await supabase.rpc('find_similar_restaurants', {
    p_name: name,
    p_limit: limit,
  })
  if (error) throw error
  return data
}

/**
 * Import d'un lieu Google. Idempotente sur `place_id` : un même lieu importé
 * par plusieurs personnes ne donne qu'une ligne, rafraîchie au passage.
 */
export async function upsertRestaurantFromPlace(
  supabase: SupabaseClient<Database>,
  place: {
    placeId: string
    name: string
    address?: string | null
    city?: string | null
    cuisineType?: string | null
    latitude?: number | null
    longitude?: number | null
    priceLevel?: number | null
  }
): Promise<Restaurant> {
  const { data, error } = await supabase.rpc('upsert_restaurant_from_place', {
    p_place_id: place.placeId,
    p_name: place.name,
    p_address: place.address ?? undefined,
    p_city: place.city ?? undefined,
    p_cuisine_type: place.cuisineType ?? undefined,
    p_latitude: place.latitude ?? undefined,
    p_longitude: place.longitude ?? undefined,
    p_price_level: place.priceLevel ?? undefined,
  })
  if (error) throw error
  return data
}
