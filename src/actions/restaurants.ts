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
  type RestaurantPage,
} from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/domain/errors'
import { CreateRestaurantSchema, SimilarRestaurantsSchema } from '@/domain/schemas/restaurant'

import type { ActionResult } from './types'
import type { Restaurant } from '@/data-access/models'

const SearchSchema = z.object({
  query: z.string().trim().max(80).default(''),
  offset: z.number().int().min(0).max(10_000).default(0),
})

/**
 * Recherche du `RestaurantPicker`. Le catalogue est public : la lecture passe
 * par le cache partagé, donc une même recherche ne touche la base qu'une fois.
 */
export async function searchRestaurantsAction(input: {
  query?: string
  offset?: number
}): Promise<ActionResult<RestaurantPage>> {
  const parsed = SearchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Recherche invalide' }

  try {
    const page = await getRestaurantCatalogPage(parsed.data)
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
