import 'server-only'

import { env } from '@/env'
import { AppError } from '@/lib/errors'
import { mapPlaceDetails, mapPlacesResponse, placesCacheKey, type PlaceResult } from '@/lib/places'
import { TtlCache } from '@/lib/ttl-cache'

/**
 * Passerelle vers la Places API (New).
 *
 * La clé ne sort jamais d'ici : le navigateur parle au route handler
 * `POST /api/places/search`, qui parle à Google. Les réponses sont gardées
 * 24 h en mémoire — une recherche répétée (« sushi » à midi, par toute
 * l'équipe) ne coûte qu'un appel.
 */

const SEARCH_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText'
const DETAILS_ENDPOINT = 'https://places.googleapis.com/v1/places'

const PLACE_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'shortFormattedAddress',
  'primaryType',
  'primaryTypeDisplayName',
  'priceLevel',
  'location',
  'addressComponents',
]

const SEARCH_FIELD_MASK = PLACE_FIELDS.map((field) => `places.${field}`).join(',')
const DETAILS_FIELD_MASK = PLACE_FIELDS.join(',')

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_RESULTS = 10
/** Rayon du biais géographique quand une position est fournie (5 km). */
const BIAS_RADIUS_M = 5000
const REQUEST_TIMEOUT_MS = 8000

const searchCache = new TtlCache<PlaceResult[]>({ ttlMs: CACHE_TTL_MS, maxEntries: 200 })
/** Alimenté par les recherches : un import se sert ici avant d'appeler Google. */
const placeCache = new TtlCache<PlaceResult>({ ttlMs: CACHE_TTL_MS, maxEntries: 500 })

export function isPlacesSearchEnabled(): boolean {
  return Boolean(env.GOOGLE_PLACES_API_KEY)
}

function requireApiKey(): string {
  const key = env.GOOGLE_PLACES_API_KEY
  if (!key) throw new AppError('La recherche Google n’est pas configurée sur ce déploiement.')
  return key
}

async function callGoogle(url: string, init: RequestInit, apiKey: string): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      ...(init.headers ?? {}),
    },
    // Le cache 24 h est le nôtre : celui de Next ne s'applique pas au POST.
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    // Le corps d'erreur Google peut contenir la clé ou des détails de quota :
    // il reste dans les logs serveur, jamais dans la réponse à l'utilisateur.
    console.error('places: réponse Google %d', response.status, await response.text())
    throw new AppError('La recherche Google a échoué. Réessaie dans un instant.')
  }

  return response.json()
}

export async function searchPlaces(input: {
  query: string
  latitude?: number | null
  longitude?: number | null
}): Promise<PlaceResult[]> {
  const apiKey = requireApiKey()
  const key = placesCacheKey(input)
  const cached = searchCache.get(key)
  if (cached) return cached

  const hasBias =
    typeof input.latitude === 'number' &&
    Number.isFinite(input.latitude) &&
    typeof input.longitude === 'number' &&
    Number.isFinite(input.longitude)

  const payload = await callGoogle(
    SEARCH_ENDPOINT,
    {
      method: 'POST',
      headers: { 'X-Goog-FieldMask': SEARCH_FIELD_MASK },
      body: JSON.stringify({
        textQuery: input.query,
        includedType: 'restaurant',
        languageCode: 'fr',
        regionCode: 'FR',
        maxResultCount: MAX_RESULTS,
        ...(hasBias
          ? {
              locationBias: {
                circle: {
                  center: { latitude: input.latitude, longitude: input.longitude },
                  radius: BIAS_RADIUS_M,
                },
              },
            }
          : {}),
      }),
    },
    apiKey
  )

  const results = mapPlacesResponse(payload)
  searchCache.set(key, results)
  results.forEach((place) => placeCache.set(place.placeId, place))
  return results
}

/**
 * Détail d'un lieu, servi par le cache des recherches quand c'est possible.
 * L'import ne fait donc confiance qu'à des données venues de Google, jamais
 * à ce que le navigateur lui envoie : il n'envoie qu'un `placeId`.
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
  const apiKey = requireApiKey()
  const cached = placeCache.get(placeId)
  if (cached) return cached

  const payload = await callGoogle(
    `${DETAILS_ENDPOINT}/${encodeURIComponent(placeId)}`,
    { method: 'GET', headers: { 'X-Goog-FieldMask': DETAILS_FIELD_MASK } },
    apiKey
  )

  const place = mapPlaceDetails(payload)
  if (place) placeCache.set(place.placeId, place)
  return place
}
