'use server'

import { revalidateTag } from 'next/cache'

import { getCurrentUser } from '@/data-access/auth'
import { RESTAURANTS_CACHE_PROFILE, RESTAURANTS_CACHE_TAG } from '@/data-access/restaurants'
import { createServerClient } from '@/data-access/supabase/server'
import { AppError, toUserMessage } from '@/domain/errors'
import { ImportPlaceSchema, SeedNeighbourhoodSchema } from '@/domain/schemas/place'
import { importPlaceUseCase } from '@/use-cases/import-place'
import { seedNeighbourhoodUseCase } from '@/use-cases/seed-neighbourhood'

import type { ActionResult } from './types'
import type { Restaurant } from '@/data-access/models'
import type { SeededNeighbourhood } from '@/use-cases/seed-neighbourhood'

/** Une `AppError` porte déjà un message lisible ; le reste retombe sur le générique. */
function userMessage(error: unknown): string {
  return toUserMessage(error, error instanceof AppError ? error.message : undefined)
}

/**
 * Lit la fiche détaillée d'un lieu chez Google et l'écrit en base.
 *
 * Le navigateur n'envoie qu'un `placeId` : les champs enregistrés sont relus
 * côté serveur (cache de la recherche, sinon détail Google), donc rien de ce
 * qui atterrit en base ne vient du client. La RPC est idempotente sur
 * `place_id`, un double clic ne crée pas de doublon.
 */
async function writePlace(placeId: string): Promise<ActionResult<Restaurant>> {
  const parsed = ImportPlaceSchema.safeParse({ placeId })
  if (!parsed.success) return { ok: false, error: 'Lieu invalide' }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: false, error: 'Tu dois d’abord choisir un pseudo.' }

  try {
    return { ok: true, data: await importPlaceUseCase(supabase, parsed.data.placeId) }
  } catch (error) {
    return { ok: false, error: userMessage(error) }
  }
}

/** Importe un lieu Google dans la base de restaurants. */
export async function importPlaceAction(placeId: string): Promise<ActionResult<Restaurant>> {
  const result = await writePlace(placeId)
  // Même raison que pour l'ajout manuel : le catalogue en cache doit voir
  // arriver le resto importé.
  if (result.ok) revalidateTag(RESTAURANTS_CACHE_TAG, RESTAURANTS_CACHE_PROFILE)
  return result
}

/**
 * Complète la fiche d'un lieu déjà en base — photo, site, résumé.
 *
 * Un amorçage de quartier n'écrit que ce qu'une recherche rend : ces
 * champs-là manquent tant que personne n'a ouvert la fiche. C'est le premier
 * affichage détaillé du resto qui les paie, une fois, et
 * `upsert_restaurant_from_place` rafraîchit sans rien effacer.
 *
 * Rien n'est revalidé ici : celui qui regarde la fiche l'a déjà complète
 * sous les yeux, et une carte de vote ne doit pas jeter le catalogue de tout
 * le monde à chaque resto affiché. La vignette du carnet se rattrapera à
 * l'expiration du cache, ou au prochain import.
 */
export async function completePlaceAction(placeId: string): Promise<ActionResult<Restaurant>> {
  return writePlace(placeId)
}

/**
 * Amorce le quartier : les restos les plus proches entrent en base d'un coup.
 *
 * Le navigateur n'envoie qu'une position — jamais un nombre de lieux ni un
 * rayon. Le plafond (vingt) et le quota par personne sont donc hors de sa
 * portée : le premier est appliqué ici, le second est tenu en base.
 */
export async function seedNeighbourhoodAction(input: {
  latitude?: number | null
  longitude?: number | null
}): Promise<ActionResult<SeededNeighbourhood>> {
  const parsed = SeedNeighbourhoodSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Position invalide' }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { ok: false, error: 'Tu dois d’abord choisir un pseudo.' }

  try {
    const seeded = await seedNeighbourhoodUseCase(supabase, parsed.data)
    // Une seule invalidation pour tout le lot : le catalogue est en cache
    // pour tout le monde, la revalider vingt fois ne le rendrait pas plus frais.
    revalidateTag(RESTAURANTS_CACHE_TAG, RESTAURANTS_CACHE_PROFILE)
    return { ok: true, data: seeded }
  } catch (error) {
    return { ok: false, error: userMessage(error) }
  }
}
