import 'server-only'

import { AppError } from '@/domain/errors'
import {
  mapPlaceDetails,
  mapPlacesResponse,
  placesCacheKey,
  type PlaceResult,
} from '@/domain/places'
import { env } from '@/env'
import { remoteImageUrl } from '@/lib/images'
import { TtlCache } from '@/lib/ttl-cache'

/**
 * Passerelle vers la Places API (New).
 *
 * La clé ne sort jamais d'ici : le navigateur parle au route handler
 * `POST /api/places/search`, qui parle à Google. Les réponses sont gardées
 * 24 h en mémoire — une recherche répétée (« sushi » à midi, par toute
 * l'équipe) ne coûte qu'un appel.
 *
 * La recherche et le détail ne demandent pas les mêmes champs : voir les deux
 * masques plus bas.
 */

const SEARCH_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText'
const DETAILS_ENDPOINT = 'https://places.googleapis.com/v1/places'
const PHOTO_ENDPOINT = 'https://places.googleapis.com/v1'

/**
 * Deux masques, deux factures.
 *
 * La recherche ne demande que de quoi afficher une liste : Google facture au
 * champ le plus cher demandé, et une recherche ramène dix résultats. Les
 * champs qui remplissent la fiche (photo, site, horaires, résumé) ne sont
 * demandés que sur le détail d'un lieu — c'est-à-dire une fois, au moment où
 * quelqu'un clique pour importer.
 */
const SEARCH_FIELDS = [
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

const DETAILS_FIELDS = [
  ...SEARCH_FIELDS,
  'editorialSummary',
  'websiteUri',
  'regularOpeningHours',
  'photos',
]

const SEARCH_FIELD_MASK = SEARCH_FIELDS.map((field) => `places.${field}`).join(',')
const DETAILS_FIELD_MASK = DETAILS_FIELDS.join(',')

/** Largeur demandée pour la photo importée : suffisante pour la carte de vote. */
const PHOTO_MAX_WIDTH_PX = 1200

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_RESULTS = 10
/** Rayon du biais géographique quand une position est fournie (5 km). */
const BIAS_RADIUS_M = 5000
const REQUEST_TIMEOUT_MS = 8000

const searchCache = new TtlCache<PlaceResult[]>({ ttlMs: CACHE_TTL_MS, maxEntries: 200 })
/**
 * Fiches détaillées uniquement. Une recherche ne les alimente plus : ses
 * résultats n'ont pas les champs enrichis, et les servir ici ferait importer
 * un resto sans photo ni horaires.
 */
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
  return results
}

/**
 * Photo servable à partir de son nom de ressource.
 *
 * L'endpoint media renvoie normalement une redirection vers l'image ;
 * `skipHttpRedirect` demande le JSON à la place, dont le `photoUri` pointe un
 * hôte Google **sans clé d'API**. C'est indispensable : l'URL est stockée en
 * base puis rendue par le navigateur, et l'URL media elle-même exigerait la
 * clé pour être chargée.
 *
 * Cette adresse n'est pas éternelle. Un réimport du même lieu la rafraîchit —
 * la RPC est idempotente sur `place_id`.
 */
async function resolvePhotoUrl(photoName: string, apiKey: string): Promise<string | null> {
  try {
    const payload = await callGoogle(
      `${PHOTO_ENDPOINT}/${photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH_PX}&skipHttpRedirect=true`,
      { method: 'GET' },
      apiKey
    )
    const uri = (payload as { photoUri?: unknown })?.photoUri
    return typeof uri === 'string' && remoteImageUrl(uri) ? uri : null
  } catch {
    // Une photo indisponible ne doit pas faire échouer l'import du resto.
    return null
  }
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

  const mapped = mapPlaceDetails(payload)
  if (!mapped) return null

  const place: PlaceResult = {
    ...mapped,
    photoUrl: mapped.photoName ? await resolvePhotoUrl(mapped.photoName, apiKey) : null,
  }
  placeCache.set(place.placeId, place)
  return place
}
