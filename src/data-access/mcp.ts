import 'server-only'

import type { Database } from '@/data-access/models/database'
import type { PlaceResult } from '@/domain/places'
import type { RestaurantTag } from '@/domain/schemas/restaurant'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Accès aux données pour le serveur MCP.
 *
 * Le serveur MCP n'a ni cookie ni session. Deux cas (voir `src/lib/mcp/auth.ts`) :
 *  - IA branchée par **jeton personnel** : client public, et le jeton passé à
 *    chaque RPC `mcp_*`, qui le résout en base et agit au nom de son
 *    propriétaire (migration `ai_access_mcp`) ;
 *  - IA connectée en **OAuth** : client qui porte le JWT de l'utilisateur,
 *    jeton nul — `mcp_act_as` rend alors `auth.uid()`.
 *
 * Les RPC rendent du JSON déjà mis en forme pour une IA ; les types ci-dessous
 * le décrivent.
 */

export interface McpRestaurant {
  id: string
  name: string
  cuisine_type?: string
  address?: string
  city?: string
  price_level?: number
  tags?: RestaurantTag[]
  website?: string
  source?: string
  google_place_id?: string
}

export interface McpFoundRestaurant extends McpRestaurant {
  /** Listes de la personne qui contiennent déjà ce resto. */
  in_my_lists: { id: string; name: string }[]
}

export interface McpList {
  id: string
  name: string
  share_code: string
  is_public: boolean
  is_collaborative: boolean
  restaurant_count: number
  updated_at: string
}

export interface McpListWithRestaurants extends McpList {
  restaurants: McpRestaurant[]
}

export interface McpAddToListResult {
  added: boolean
  already_in_list: boolean
  list: McpList
  restaurant: McpRestaurant
}

export interface McpRemoveFromListResult {
  removed: boolean
  list: McpList
}

export interface McpWhoami {
  pseudo: string
  list_count: number
}

type Functions = Database['public']['Functions']
type McpFunction = Extract<keyof Functions, `mcp_${string}`>

/** Qui appelle, et avec quoi : voir l'en-tête du module. */
export interface McpAccess {
  client: SupabaseClient<Database>
  token: string | null
}

/**
 * Appelle une RPC `mcp_*` et rend son JSON. Les erreurs `omk:` de la base
 * remontent telles quelles : le serveur MCP les traduit pour l'IA.
 *
 * Le générateur type ces RPC en `Json` : les arguments sont vérifiés par lui,
 * la forme rendue par les interfaces ci-dessus.
 */
async function call<T, F extends McpFunction>(
  access: McpAccess,
  fn: F,
  args: Omit<Functions[F]['Args'], 'p_token'>
): Promise<T> {
  // `p_token` nul est légitime (OAuth) ; le générateur de types le déclare
  // `string` faute de savoir qu'un argument SQL peut être nul.
  const withToken = { ...args, p_token: access.token } as unknown as Functions[F]['Args']
  const { data, error } = await access.client.rpc(fn, withToken)
  if (error) throw error
  return data as T
}

export function mcpWhoami(access: McpAccess): Promise<McpWhoami> {
  return call(access, 'mcp_whoami', {})
}

export function mcpLists(access: McpAccess): Promise<McpList[]> {
  return call(access, 'mcp_lists', {})
}

export function mcpList(access: McpAccess, listId: string): Promise<McpListWithRestaurants> {
  return call(access, 'mcp_list', { p_list_id: listId })
}

export function mcpCreateList(access: McpAccess, name: string): Promise<McpList> {
  return call(access, 'mcp_create_list', { p_name: name })
}

export function mcpFindRestaurants(
  access: McpAccess,
  input: { query: string; city?: string | null; limit?: number }
): Promise<McpFoundRestaurant[]> {
  return call(access, 'mcp_find_restaurants', {
    p_query: input.query,
    p_city: input.city ?? undefined,
    p_limit: input.limit ?? 8,
  })
}

export function mcpCreateRestaurant(
  access: McpAccess,
  input: {
    name: string
    cuisineType?: string | null
    address?: string | null
    city?: string | null
    priceLevel?: number | null
    tags?: RestaurantTag[]
  }
): Promise<McpRestaurant> {
  return call(access, 'mcp_create_restaurant', {
    p_name: input.name,
    p_cuisine_type: input.cuisineType ?? undefined,
    p_address: input.address ?? undefined,
    p_city: input.city ?? undefined,
    p_price_level: input.priceLevel ?? undefined,
    p_tags: input.tags?.length ? input.tags : undefined,
  })
}

/** Écrit une fiche Google déjà relue côté serveur — jamais des champs venus de l'IA. */
export function mcpImportPlace(access: McpAccess, place: PlaceResult): Promise<McpRestaurant> {
  return call(access, 'mcp_import_place', {
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
}

export function mcpAddToList(
  access: McpAccess,
  listId: string,
  restaurantId: string
): Promise<McpAddToListResult> {
  return call(access, 'mcp_add_to_list', { p_list_id: listId, p_restaurant_id: restaurantId })
}

export function mcpRemoveFromList(
  access: McpAccess,
  listId: string,
  restaurantId: string
): Promise<McpRemoveFromListResult> {
  return call(access, 'mcp_remove_from_list', { p_list_id: listId, p_restaurant_id: restaurantId })
}
