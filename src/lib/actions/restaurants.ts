'use server'

import { z } from 'zod'

import { searchRestaurants, type RestaurantPage } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'

import type { ActionResult } from './types'

const SearchSchema = z.object({
  query: z.string().trim().max(80).default(''),
  offset: z.number().int().min(0).max(10_000).default(0),
})

export async function searchRestaurantsAction(input: {
  query?: string
  offset?: number
}): Promise<ActionResult<RestaurantPage>> {
  const parsed = SearchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Recherche invalide' }

  const supabase = await createServerClient()
  try {
    const page = await searchRestaurants(supabase, parsed.data)
    return { ok: true, data: page }
  } catch {
    return { ok: false, error: 'La recherche a échoué. Réessaie.' }
  }
}
