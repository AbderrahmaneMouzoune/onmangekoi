import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/data-access/auth'
import { isPlacesSearchEnabled, searchNearbyPlaces, searchPlaces } from '@/data-access/places'
import { AppError, GENERIC_ERROR } from '@/domain/errors'
import { hasPosition, PLACES_QUERY_MIN, SearchPlacesSchema } from '@/domain/schemas/place'

import type { PlacesPage } from '@/domain/places'

/**
 * `POST /api/places/search` — recherche de restaurants chez Google.
 *
 * Avec un texte, c'est une recherche, que la position — si la personne l'a
 * autorisée — ne fait que biaiser. Sans texte mais avec une position, ce sont
 * les restos les plus proches. Un `pageToken` rendu avec une réponse donne la
 * page suivante de la même demande. La clé Places reste côté serveur, et les
 * réponses sont mises en cache 24 h dans `data-access/places.ts`.
 *
 * Réservé aux personnes connectées : une recherche coûte un appel facturé.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isPlacesSearchEnabled()) {
    return NextResponse.json(
      { error: 'La recherche Google n’est pas configurée sur ce déploiement.' },
      { status: 503 }
    )
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Tu dois d’abord choisir un pseudo.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const parsed = SearchPlacesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Recherche invalide' },
      { status: 400 }
    )
  }

  try {
    const input = parsed.data
    const page: PlacesPage =
      input.query.length >= PLACES_QUERY_MIN
        ? await searchPlaces(input)
        : hasPosition(input)
          ? await searchNearbyPlaces(input)
          : { places: [], nextPageToken: null }
    return NextResponse.json({ results: page.places, nextPageToken: page.nextPageToken })
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    console.error('places: recherche impossible', error)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}
