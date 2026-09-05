'use server'

import { getCurrentUser } from '@/data-access/auth'
import { getPlaceDetails } from '@/data-access/places'
import { upsertRestaurantFromPlace } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { AppError, toUserMessage } from '@/lib/errors'
import { ImportPlaceSchema } from '@/lib/schemas/place'

import type { ActionResult } from './types'
import type { Restaurant } from '@/data-access/models'

/**
 * Importe un lieu Google dans la base de restaurants.
 *
 * Le navigateur n'envoie qu'un `placeId` : les champs enregistrés sont relus
 * côté serveur (cache de la recherche, sinon détail Google), donc rien de ce
 * qui atterrit en base ne vient du client. La RPC est idempotente sur
 * `place_id`, un double clic ne crée pas de doublon.
 */
export async function importPlaceAction(placeId: string): Promise<ActionResult<Restaurant>> {
  const parsed = ImportPlaceSchema.safeParse({ placeId })
  if (!parsed.success) return { ok: false, error: 'Lieu invalide' }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: false, error: 'Tu dois d’abord choisir un pseudo.' }

  try {
    const place = await getPlaceDetails(parsed.data.placeId)
    if (!place) return { ok: false, error: 'Ce lieu n’existe plus chez Google.' }

    return { ok: true, data: await upsertRestaurantFromPlace(supabase, place) }
  } catch (error) {
    // Une `AppError` porte déjà un message lisible (clé absente, Google en
    // vrac) ; tout le reste retombe sur le libellé générique.
    const fallback = error instanceof AppError ? error.message : undefined
    return { ok: false, error: toUserMessage(error, fallback) }
  }
}
