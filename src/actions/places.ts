'use server'

import { revalidateTag } from 'next/cache'

import { getCurrentUser } from '@/data-access/auth'
import { RESTAURANTS_CACHE_PROFILE, RESTAURANTS_CACHE_TAG } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { AppError, toUserMessage } from '@/domain/errors'
import { ImportPlaceSchema } from '@/domain/schemas/place'
import { importPlaceUseCase } from '@/use-cases/import-place'

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
    const restaurant = await importPlaceUseCase(supabase, parsed.data.placeId)
    // Même raison que pour l'ajout manuel : le catalogue en cache doit voir
    // arriver le resto importé.
    revalidateTag(RESTAURANTS_CACHE_TAG, RESTAURANTS_CACHE_PROFILE)
    return { ok: true, data: restaurant }
  } catch (error) {
    // Une `AppError` porte déjà un message lisible (clé absente, Google en
    // vrac) ; tout le reste retombe sur le libellé générique.
    const fallback = error instanceof AppError ? error.message : undefined
    return { ok: false, error: toUserMessage(error, fallback) }
  }
}
