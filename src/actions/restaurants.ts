'use server'

import { revalidateTag } from 'next/cache'
import { z } from 'zod'

import { getCurrentUser } from '@/data-access/auth'
import {
  createManualRestaurant,
  findSimilarRestaurants,
  getRestaurantCatalogPage,
  RESTAURANTS_CACHE_PROFILE,
  RESTAURANTS_CACHE_TAG,
  snapOrigin,
  type RestaurantPage,
} from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/domain/errors'
import {
  CreateRestaurantSchema,
  RESTAURANT_TAGS,
  SimilarRestaurantsSchema,
} from '@/domain/schemas/restaurant'

import type { ActionResult } from './types'
import type { Restaurant } from '@/data-access/models'

const SearchSchema = z.object({
  query: z.string().trim().max(80).default(''),
  offset: z.number().int().min(0).max(10_000).default(0),
  priceMax: z.number().int().min(1).max(4).nullable().default(null),
  tags: z.array(z.enum(RESTAURANT_TAGS)).max(RESTAURANT_TAGS.length).default([]),
  withinKm: z.number().positive().max(50).nullable().default(null),
  /**
   * Position du navigateur. Elle sert à cette requête et à rien d'autre :
   * jamais stockée, jamais mesurée, arrondie avant même de servir de clé de
   * cache.
   */
  origin: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable()
    .default(null),
})

export type SearchRestaurantsInput = z.input<typeof SearchSchema>

/**
 * Recherche du `RestaurantPicker`. Le catalogue est public : la lecture passe
 * par le cache partagé, donc une même recherche ne touche la base qu'une fois.
 */
export async function searchRestaurantsAction(
  input: SearchRestaurantsInput
): Promise<ActionResult<RestaurantPage>> {
  const parsed = SearchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Recherche invalide' }

  try {
    const page = await getRestaurantCatalogPage({
      ...parsed.data,
      origin: snapOrigin(parsed.data.origin),
    })
    return { ok: true, data: page }
  } catch {
    return { ok: false, error: 'La recherche a échoué. Réessaie.' }
  }
}

/**
 * Ajout manuel. La validation Zod ici sert les messages de formulaire ; la
 * base revérifie les mêmes règles et pose `created_by` / `source` elle-même.
 */
export async function createRestaurantAction(input: {
  name?: string | null
  cuisineType?: string | null
  address?: string | null
  city?: string | null
  priceLevel?: number | string | null
  tags?: string[] | null
}): Promise<ActionResult<Restaurant>> {
  const parsed = CreateRestaurantSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Formulaire invalide' }
  }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: false, error: 'Tu dois d’abord choisir un pseudo.' }

  try {
    const restaurant = await createManualRestaurant(supabase, parsed.data)
    // Le catalogue est mis en cache pour tout le monde : sans invalidation, le
    // resto resterait invisible dans les recherches suivantes pendant des heures.
    revalidateTag(RESTAURANTS_CACHE_TAG, RESTAURANTS_CACHE_PROFILE)
    return { ok: true, data: restaurant }
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }
}

/** Doublons probables, pour prévenir avant l'ajout. Un échec reste silencieux. */
export async function findSimilarRestaurantsAction(
  name: string
): Promise<ActionResult<Restaurant[]>> {
  const parsed = SimilarRestaurantsSchema.safeParse({ name })
  if (!parsed.success) return { ok: true, data: [] }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: true, data: [] }

  try {
    return { ok: true, data: await findSimilarRestaurants(supabase, parsed.data.name) }
  } catch {
    return { ok: true, data: [] }
  }
}
