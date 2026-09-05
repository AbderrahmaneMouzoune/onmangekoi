'use server'

import { z } from 'zod'

import { getRestaurantCatalogPage, type RestaurantPage } from '@/data-access/restaurants'

import type { ActionResult } from './types'

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
