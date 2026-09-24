import { cacheLife, cacheTag } from 'next/cache'

import { createPublicClient } from '@/data-access/supabase/public'

import type { Restaurant } from './models'
import type { Database } from './models/database'
import type { PlaceResult } from '@/domain/places'
import type { RestaurantTag } from '@/domain/schemas/restaurant'
import type { GeoPoint } from '@/lib/maps'
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
  /** Budget maximum accepté, de 1 à 4 */
  priceMax?: number | null
  /** Régimes exigés — tous à la fois */
  tags?: RestaurantTag[]
  /** Rayon autour de `origin`, en kilomètres. Sans position, il ne filtre rien. */
  withinKm?: number | null
  /** Position de la personne, jamais stockée : elle ne sert qu'à cette requête. */
  origin?: GeoPoint | null
}

/**
 * Précision retenue pour la position dans la clé de cache : trois décimales,
 * soit environ 110 m. Assez fin pour un rayon de 500 m, assez grossier pour
 * que deux personnes du même bureau tombent sur la même entrée de cache au
 * lieu d'en créer une par GPS.
 */
const ORIGIN_PRECISION = 1000

/** Arrondit une position pour qu'elle puisse servir de clé de cache partagée. */
export function snapOrigin(origin: GeoPoint | null | undefined): GeoPoint | null {
  if (!origin) return null
  return {
    lat: Math.round(origin.lat * ORIGIN_PRECISION) / ORIGIN_PRECISION,
    lng: Math.round(origin.lng * ORIGIN_PRECISION) / ORIGIN_PRECISION,
  }
}

/**
 * Recherche du catalogue, filtres compris.
 *
 * Tout est filtré en base, par la RPC `search_restaurants` : c'est la seule
 * façon de garder la pagination juste quand les filtres se combinent — une
 * page réduite après coup côté client sauterait des résultats à chaque
 * « Afficher plus ». La RPC rend une ligne de plus que la page demandée,
 * c'est ce qui dit s'il en reste.
 */
export async function searchRestaurants(
  supabase: SupabaseClient<Database>,
  options: RestaurantSearchOptions = {}
): Promise<RestaurantPage> {
  const limit = Math.min(Math.max(options.limit ?? RESTAURANT_PAGE_SIZE, 1), 50)
  const offset = Math.max(options.offset ?? 0, 0)
  const query = (options.query ?? '').trim()
  const origin = options.origin ?? null

  const { data, error } = await supabase.rpc('search_restaurants', {
    p_query: query || undefined,
    p_price_max: options.priceMax ?? undefined,
    p_tags: options.tags?.length ? options.tags : undefined,
    p_lat: origin?.lat,
    p_lng: origin?.lng,
    p_within_km: options.withinKm ?? undefined,
    p_limit: limit + 1,
    p_offset: offset,
  })
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
 * Les arguments font partie de la clé de cache — recherche, filtres et
 * pagination du `RestaurantPicker` en profitent donc aussi. La position, elle,
 * est arrondie par `snapOrigin` avant d'arriver ici : au GPS près, chaque
 * personne aurait sa propre entrée de cache.
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
    tags?: RestaurantTag[]
  }
): Promise<Restaurant> {
  const { data, error } = await supabase.rpc('create_manual_restaurant', {
    p_name: input.name,
    p_cuisine_type: input.cuisineType ?? undefined,
    p_address: input.address ?? undefined,
    p_city: input.city ?? undefined,
    p_price_level: input.priceLevel ?? undefined,
    p_tags: input.tags?.length ? input.tags : undefined,
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
  place: PlaceResult
): Promise<Restaurant> {
  const { data, error } = await supabase.rpc('upsert_restaurant_from_place', {
    p_place_id: place.placeId,
    p_name: place.name,
    p_address: place.address ?? undefined,
    p_city: place.city ?? undefined,
    p_cuisine_type: place.cuisineType ?? undefined,
    p_price_level: place.priceLevel ?? undefined,
    p_description: place.description ?? undefined,
    p_photo_url: place.photoUrl ?? undefined,
    p_website: place.website ?? undefined,
    p_location: place.location ?? undefined,
    p_opening_hours: place.openingHours ?? undefined,
    p_tags: place.tags.length > 0 ? place.tags : undefined,
  })
  if (error) throw error
  return data
}
