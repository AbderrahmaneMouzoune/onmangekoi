import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/data-access/auth'
import { isPlacesSearchEnabled, searchPlaces } from '@/data-access/places'
import { AppError, GENERIC_ERROR } from '@/lib/errors'
import { SearchPlacesSchema } from '@/lib/schemas/place'

import type { PlaceResult } from '@/lib/places'

/**
 * `POST /api/places/search` — recherche de restaurants chez Google.
 *
 * La clé Places reste côté serveur : le navigateur n'envoie qu'un texte et,
 * si la personne l'a autorisé, sa position pour biaiser les résultats. Les
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
    const results: PlaceResult[] = await searchPlaces(parsed.data)
    return NextResponse.json({ results })
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    console.error('places: recherche impossible', error)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 })
  }
}
