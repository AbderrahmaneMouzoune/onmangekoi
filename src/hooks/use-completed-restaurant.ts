'use client'

import { useEffect, useState } from 'react'

import { completePlaceAction } from '@/actions/places'

import type { Restaurant } from '@/data-access/models'

/**
 * Fiches complétées, par lieu Google, pour toute la vie de la page. Une carte
 * remontée (le deck reconstruit la sienne à chaque vote) retrouve la fiche
 * déjà payée au lieu d'en redemander une.
 */
const completions = new Map<string, Restaurant>()
/** Demandes en cours : deux cartes du même lieu ne font qu'un appel. */
const inflight = new Map<string, Promise<Restaurant | null>>()

/**
 * Une fiche venue de Google sans photo n'a jamais été détaillée : l'amorçage
 * de quartier ne demande que le masque « liste », et le détail, lui, ramène
 * toujours une photo — quand le lieu en a une.
 *
 * Les rares lieux que Google ne photographie pas repasseront donc par ici à
 * la prochaine page : le cache 24 h de `getPlaceDetails` absorbe la
 * répétition côté serveur, et marquer la fiche en base coûterait une colonne
 * pour un cas qui ne se voit pas.
 */
function needsDetails(restaurant: Restaurant): boolean {
  return Boolean(restaurant.place_id) && restaurant.photo_url === null
}

function completePlace(placeId: string): Promise<Restaurant | null> {
  const done = completions.get(placeId)
  if (done) return Promise.resolve(done)

  const pending = inflight.get(placeId)
  if (pending) return pending

  const promise = completePlaceAction(placeId)
    .then((result) => {
      if (!result.ok) return null
      completions.set(placeId, result.data)
      return result.data
    })
    // Une fiche qui refuse de se compléter n'est pas une erreur à montrer :
    // la carte s'affiche sans photo, comme avant l'appel.
    .catch(() => null)
    .finally(() => inflight.delete(placeId))

  inflight.set(placeId, promise)
  return promise
}

/**
 * La fiche complète d'un restaurant, payée au premier affichage détaillé.
 *
 * Un quartier amorcé entre en base avec ce qu'une recherche Google rend :
 * nom, adresse, cuisine, budget, horaires. La photo, le site et le résumé
 * demandent un appel de plus, par lieu — le faire pour vingt restos d'un
 * coup reviendrait à payer le prix fort pour des fiches que personne
 * n'ouvrira. On le fait donc ici, pour la carte qu'on regarde, une fois : la
 * RPC d'import rafraîchit sans effacer, et le resto garde sa fiche ensuite.
 */
export function useCompletedRestaurant(restaurant: Restaurant | null): Restaurant | null {
  const [completed, setCompleted] = useState<Restaurant | null>(null)
  const placeId = restaurant && needsDetails(restaurant) ? restaurant.place_id : null

  useEffect(() => {
    if (!placeId) return
    let cancelled = false
    void completePlace(placeId).then((fiche) => {
      if (!cancelled && fiche) setCompleted(fiche)
    })
    return () => {
      cancelled = true
    }
  }, [placeId])

  // La carte change sous le même composant : une fiche complétée pour le
  // restaurant précédent ne doit surtout pas s'afficher sur le suivant.
  return completed?.id === restaurant?.id ? completed : restaurant
}
