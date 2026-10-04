import { NextResponse } from 'next/server'
import { getLocale } from 'next-intl/server'

import { getCurrentUser } from '@/data-access/auth'
import { isPlacesSearchEnabled, searchNearbyPlaces, searchPlaces } from '@/data-access/places'
import { AppError } from '@/domain/errors'
import { hasPosition, PLACES_QUERY_MIN, SearchPlacesSchema } from '@/domain/schemas/place'
import { errorMessage, translateError, translateIssue } from '@/i18n/server'

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
 *
 * Google répond dans la langue de l'interface. La route est hors du segment
 * `[locale]` et hors du proxy : la langue vient du cookie `NEXT_LOCALE`, puis
 * d'`Accept-Language`, que le `fetch` du navigateur envoie.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isPlacesSearchEnabled()) {
    return NextResponse.json(
      { error: await errorMessage('places_not_configured') },
      { status: 503 }
    )
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: await errorMessage('not_authenticated') }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: await errorMessage('invalid_request') }, { status: 400 })
  }

  const parsed = SearchPlacesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: await translateIssue(parsed.error.issues[0], await errorMessage('invalid_search')),
      },
      { status: 400 }
    )
  }

  try {
    const input = { ...parsed.data, locale: await getLocale() }
    const page: PlacesPage =
      input.query.length >= PLACES_QUERY_MIN
        ? await searchPlaces(input)
        : hasPosition(input)
          ? await searchNearbyPlaces(input)
          : { places: [], nextPageToken: null }
    return NextResponse.json({ results: page.places, nextPageToken: page.nextPageToken })
  } catch (error) {
    // Hors du segment `[locale]` : la langue vient du cookie ou
    // d'`Accept-Language`, que le `fetch` du navigateur envoie.
    if (error instanceof AppError) {
      return NextResponse.json({ error: await translateError(error) }, { status: 502 })
    }
    console.error('places: recherche impossible', error)
    return NextResponse.json({ error: await translateError(error) }, { status: 500 })
  }
}
