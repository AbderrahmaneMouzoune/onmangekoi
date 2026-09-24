import 'server-only'

import { AppError } from '@/domain/errors'
import {
  mapPlaceDetails,
  mapPlacesPage,
  nearbyCacheKey,
  placesCacheKey,
  type PlaceResult,
  type PlacesPage,
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
 * champ le plus cher demandé, et une recherche ramène dix résultats. Le
 * budget (`priceLevel`) place déjà la recherche dans le palier « Enterprise »
 * de Text Search : la note, le nombre d'avis et les horaires, qui relèvent du
 * même palier, ne coûtent donc rien de plus et illustrent la liste sans
 * attendre l'import. Les champs qui restent chers ou lourds — photo (un appel
 * de plus par lieu), site, résumé — ne sont demandés que sur le détail d'un
 * lieu, c'est-à-dire une fois, au moment où quelqu'un clique pour importer.
 */
const SEARCH_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'shortFormattedAddress',
  'primaryType',
  'primaryTypeDisplayName',
  'priceLevel',
  'rating',
  'userRatingCount',
  'regularOpeningHours',
  'location',
  'addressComponents',
]

const DETAILS_FIELDS = [
  ...SEARCH_FIELDS,
  'editorialSummary',
  'websiteUri',
  'photos',
  // Seul régime que Google expose. Il appartient au même palier de
  // facturation qu'`editorialSummary`, déjà demandé ici : le détail ne coûte
  // donc pas un centime de plus, et un import arrive tagué « végétarien ».
  'servesVegetarianFood',
]

/** `nextPageToken` doit être demandé explicitement, sinon Google ne le renvoie pas. */
const SEARCH_FIELD_MASK = [
  ...SEARCH_FIELDS.map((field) => `places.${field}`),
  'nextPageToken',
].join(',')
const DETAILS_FIELD_MASK = DETAILS_FIELDS.join(',')

/** Largeur demandée pour la photo importée : suffisante pour la carte de vote. */
const PHOTO_MAX_WIDTH_PX = 1200

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
/**
 * Vingt lieux par page, le maximum que Google accorde : une recherche est
 * facturée à la requête, pas au résultat, et « voir plus » en redemande une.
 */
const PAGE_SIZE = 20
/** Rayon du biais géographique quand une position est fournie (5 km). */
const BIAS_RADIUS_M = 5000
/**
 * Rayon du biais « autour de moi » (2 km). Un biais, pas une restriction :
 * en ville les vingt premiers sont vraiment ceux d'à côté — ils sont classés
 * par distance —, et un village trouve quand même quelque chose au-delà.
 */
const NEARBY_RADIUS_M = 2000
const REQUEST_TIMEOUT_MS = 8000

/** Pages de recherche, par requête + biais + jeton de page. */
const searchCache = new TtlCache<PlacesPage>({ ttlMs: CACHE_TTL_MS, maxEntries: 400 })
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

/**
 * Tous les refus de Google ne se valent pas : une clé rejetée le restera tant
 * que la console Google Cloud n'aura pas bougé, alors qu'un 5xx passe tout
 * seul. Le statut HTTP suffit à les séparer, et le message dit à qui le lit
 * s'il faut réessayer ou aller regarder la configuration — sans jamais citer
 * ce que Google a répondu.
 */
function failureMessage(status: number): string {
  if (status === 401 || status === 403)
    return 'Google refuse la clé de ce déploiement : la recherche est indisponible.'
  if (status === 429) return 'Trop de recherches Google d’un coup. Réessaie dans une minute.'
  return 'La recherche Google a échoué. Réessaie dans un instant.'
}

/**
 * Google répond ses erreurs en JSON : `{ error: { status, message } }`. Seul
 * `status` est remonté en tête du log — c'est une énumération
 * (`PERMISSION_DENIED`, `RESOURCE_EXHAUSTED`, `SERVICE_DISABLED`…) qui nomme
 * la panne d'un coup d'œil ; `message`, lui, peut citer la clé et reste noyé
 * dans le corps.
 */
function errorReason(body: string): string {
  try {
    const reason = (JSON.parse(body) as { error?: { status?: unknown } })?.error?.status
    return typeof reason === 'string' ? reason : 'HTTP'
  } catch {
    return 'HTTP'
  }
}

async function callGoogle(
  label: string,
  url: string,
  init: RequestInit,
  apiKey: string
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
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
  } catch (error) {
    // Délai dépassé ou réseau : Google n'a rien répondu, il n'y a pas de
    // statut à interpréter. Sans ce filet, l'appel remonterait en erreur
    // technique et l'interface afficherait un message générique.
    console.error('places: %s injoignable', label, error)
    throw new AppError('Google n’a pas répondu à temps. Réessaie dans un instant.')
  }

  if (!response.ok) {
    // Le corps d'erreur Google peut contenir la clé ou des détails de quota :
    // il reste dans les logs serveur, jamais dans la réponse à l'utilisateur.
    const body = await response.text()
    console.error('places: %s → %d %s', label, response.status, errorReason(body), body)
    throw new AppError(failureMessage(response.status))
  }

  return response.json()
}

/** Clé d'une page : celle de la recherche, suffixée du jeton quand il y en a un. */
function pageKey(base: string, pageToken: string | null | undefined): string {
  return pageToken ? `${base}|${pageToken}` : base
}

/**
 * Une page de Text Search (New), servie par le cache quand elle y est. La
 * recherche par nom et « autour de moi » passent toutes deux par ici : même
 * endpoint, même masque, même pagination — seule la demande change.
 */
async function searchTextPage(
  label: string,
  key: string,
  request: Record<string, unknown>,
  apiKey: string
): Promise<PlacesPage> {
  const cached = searchCache.get(key)
  if (cached) return cached

  const payload = await callGoogle(
    label,
    SEARCH_ENDPOINT,
    {
      method: 'POST',
      headers: { 'X-Goog-FieldMask': SEARCH_FIELD_MASK },
      body: JSON.stringify(request),
    },
    apiKey
  )

  const page = mapPlacesPage(payload)
  searchCache.set(key, page)
  return page
}

export async function searchPlaces(input: {
  query: string
  latitude?: number | null
  longitude?: number | null
  pageToken?: string | null
}): Promise<PlacesPage> {
  const apiKey = requireApiKey()

  const hasBias =
    typeof input.latitude === 'number' &&
    Number.isFinite(input.latitude) &&
    typeof input.longitude === 'number' &&
    Number.isFinite(input.longitude)

  return searchTextPage(
    'recherche',
    pageKey(placesCacheKey(input), input.pageToken),
    {
      textQuery: input.query,
      includedType: 'restaurant',
      languageCode: 'fr',
      regionCode: 'FR',
      pageSize: PAGE_SIZE,
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
      ...(input.pageToken ? { pageToken: input.pageToken } : {}),
    },
    apiKey
  )
}

/**
 * Les restaurants les plus proches d'une position, sans texte à taper.
 *
 * C'est ce que l'onglet Google affiche d'emblée : la personne l'ouvre, voit
 * ce qu'il y a autour, et ne cherche un nom que si le resto qu'elle a en tête
 * n'y est pas. C'est une Text Search sur « restaurant », classée par
 * distance, plutôt qu'une Nearby Search : la première se pagine — « voir
 * plus » donne les vingt suivants —, la seconde s'arrête à vingt.
 */
export async function searchNearbyPlaces(input: {
  latitude: number
  longitude: number
  pageToken?: string | null
}): Promise<PlacesPage> {
  const apiKey = requireApiKey()

  return searchTextPage(
    'autour de moi',
    pageKey(nearbyCacheKey(input), input.pageToken),
    {
      textQuery: 'restaurant',
      includedType: 'restaurant',
      languageCode: 'fr',
      regionCode: 'FR',
      pageSize: PAGE_SIZE,
      rankPreference: 'DISTANCE',
      locationBias: {
        circle: {
          center: { latitude: input.latitude, longitude: input.longitude },
          radius: NEARBY_RADIUS_M,
        },
      },
      ...(input.pageToken ? { pageToken: input.pageToken } : {}),
    },
    apiKey
  )
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
      'photo',
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
    'détail',
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
