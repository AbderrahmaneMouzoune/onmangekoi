import { claimNeighbourhoodImport } from '@/data-access/place-imports'
import { searchNearbyPlaces } from '@/data-access/places'
import { upsertRestaurantFromPlace } from '@/data-access/restaurants'
import { AppError } from '@/domain/errors'
import { NEIGHBOURHOOD_IMPORT_MAX } from '@/domain/schemas/place'

import type { Restaurant } from '@/data-access/models'
import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SeededNeighbourhood {
  /** Les restos entrés en base : nouveaux, ou rafraîchis s'ils y étaient déjà. */
  restaurants: Restaurant[]
  /** Lieux rendus par Google que la base a refusés — le lot n'est pas annulé pour autant. */
  failed: number
  /** Amorçages restants à l'appelant sur sa fenêtre, tels que la base les compte. */
  remaining: number
}

/**
 * Amorcer un quartier : les restaurants les plus proches d'une position
 * entrent en base d'un seul geste.
 *
 * Trois choses, dans cet ordre :
 *
 * 1. **Le créneau, avant tout appel.** Le quota vit en base et se prend
 *    d'abord : c'est la recherche Google qui se facture, la refuser après
 *    l'avoir payée ne protégerait rien.
 * 2. **Une recherche, pas vingt détails.** `searchNearbyPlaces` ne demande
 *    que le masque « liste » — nom, adresse, cuisine, budget, horaires,
 *    coordonnées. Photo, site et résumé viendront au premier affichage
 *    détaillé du resto, par `completePlaceAction` : payer vingt détails ici
 *    coûterait le prix fort pour des fiches que personne n'ouvrira.
 * 3. **Un lot qui survit à ses ratés.** Chaque lieu est écrit par la RPC
 *    idempotente sur `place_id` : un lieu refusé n'emporte pas les autres,
 *    et l'appelant sait combien sont passés à côté.
 */
export async function seedNeighbourhoodUseCase(
  supabase: SupabaseClient<Database>,
  position: { latitude: number; longitude: number }
): Promise<SeededNeighbourhood> {
  const remaining = await claimNeighbourhoodImport(supabase)

  const page = await searchNearbyPlaces(position)
  // Une page Google en rend vingt : la coupe est une ceinture, pas un filtre.
  const places = page.places.slice(0, NEIGHBOURHOOD_IMPORT_MAX)
  if (places.length === 0) {
    throw new AppError('Google ne trouve aucun resto autour de toi.')
  }

  const settled = await Promise.allSettled(
    places.map((place) => upsertRestaurantFromPlace(supabase, place))
  )

  const restaurants: Restaurant[] = []
  let failed = 0
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      restaurants.push(result.value)
      return
    }
    failed += 1
    // Le détail reste dans les logs : la personne n'a que faire du lieu qui
    // a coincé, elle veut savoir que les autres sont bien là.
    console.error('amorçage: lieu %s refusé', places[index]?.placeId, result.reason)
  })

  if (restaurants.length === 0) {
    throw new AppError('Aucun resto n’a pu être enregistré. Réessaie dans un instant.')
  }

  return { restaurants, failed, remaining }
}
