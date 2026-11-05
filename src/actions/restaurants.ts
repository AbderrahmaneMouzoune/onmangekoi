'use server'

import { revalidateTag } from 'next/cache'

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
import {
  CreateRestaurantSchema,
  RestaurantSearchSchema,
  SimilarRestaurantsSchema,
} from '@/domain/schemas/restaurant'
import { errorMessage, translateError, translateIssue } from '@/i18n/server'

import type { ActionResult } from './types'
import type { Restaurant } from '@/data-access/models'
import type { z } from 'zod'

export type SearchRestaurantsInput = z.input<typeof RestaurantSearchSchema>

/**
 * Recherche du `RestaurantPicker`. Le catalogue est public : la lecture passe
 * par le cache partagé, donc une même recherche ne touche la base qu'une fois.
 */
export async function searchRestaurantsAction(
  input: SearchRestaurantsInput
): Promise<ActionResult<RestaurantPage>> {
  const parsed = RestaurantSearchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_search') }

  try {
    const page = await getRestaurantCatalogPage({
      ...parsed.data,
      origin: snapOrigin(parsed.data.origin),
    })
    return { ok: true, data: page }
  } catch (error) {
    return { ok: false, error: await translateError(error, 'restaurantSearch') }
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
    return {
      ok: false,
      error: await translateIssue(parsed.error.issues[0], await errorMessage('invalid_form')),
    }
  }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  try {
    const restaurant = await createManualRestaurant(supabase, parsed.data)
    // Le catalogue est mis en cache pour tout le monde : sans invalidation, le
    // resto resterait invisible dans les recherches suivantes pendant des heures.
    revalidateTag(RESTAURANTS_CACHE_TAG, RESTAURANTS_CACHE_PROFILE)
    return { ok: true, data: restaurant }
  } catch (error) {
    return { ok: false, error: await translateError(error) }
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
