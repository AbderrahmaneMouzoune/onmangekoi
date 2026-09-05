import { z } from 'zod'

import { RESTAURANT_NAME_MAX, RESTAURANT_NAME_MIN } from '@/domain/schemas/restaurant'

import type { OpeningHours } from '@/domain/opening-hours'
import type { GeoPoint } from '@/lib/maps'

/**
 * Traduction des réponses de la Places API (New) vers le modèle de l'app.
 *
 * Module pur : aucun appel réseau, aucune clé. Il est testable seul, et c'est
 * `data-access/places.ts` qui l'alimente avec le JSON brut de Google.
 */

/**
 * Un lieu Google ramené aux seuls champs qui nous intéressent.
 *
 * Les champs enrichis (`description` et au-delà) ne sont demandés que sur le
 * détail d'un lieu, pas sur la recherche : voir `data-access/places.ts`. Une
 * recherche les laisse donc à `null`.
 */
export interface PlaceResult {
  placeId: string
  name: string
  address: string | null
  city: string | null
  cuisineType: string | null
  priceLevel: number | null
  location: GeoPoint | null
  description: string | null
  website: string | null
  openingHours: OpeningHours | null
  /**
   * Nom de ressource de la photo (`places/X/photos/Y`), pas une URL : il faut
   * un appel de plus pour obtenir l'adresse servable. C'est
   * `data-access/places.ts` qui le fait, à l'import seulement.
   */
  photoName: string | null
  /** Adresse servable de la photo, résolue à l'import. */
  photoUrl: string | null
}

/**
 * Réponse Google : tout est facultatif côté API, donc tout est facultatif ici.
 * `catchall` laisse passer les champs qu'on ne demande pas sans faire échouer
 * la lecture le jour où Google en ajoute.
 */
const LocalizedTextSchema = z.object({ text: z.string().optional() }).loose()

/**
 * Une période Google : `{open: {day, hour, minute}, close?: {...}}`. `day` suit
 * la même convention que la nôtre (0 = dimanche). `close` manque quand le lieu
 * est ouvert en continu.
 */
const GoogleTimeSchema = z
  .object({
    day: z.number().int().min(0).max(6).optional(),
    hour: z.number().int().min(0).max(23).optional(),
    minute: z.number().int().min(0).max(59).optional(),
  })
  .loose()

const GooglePeriodSchema = z
  .object({ open: GoogleTimeSchema.optional(), close: GoogleTimeSchema.optional() })
  .loose()

const GooglePlaceSchema = z
  .object({
    id: z.string().optional(),
    displayName: LocalizedTextSchema.optional(),
    formattedAddress: z.string().optional(),
    shortFormattedAddress: z.string().optional(),
    primaryType: z.string().optional(),
    primaryTypeDisplayName: LocalizedTextSchema.optional(),
    priceLevel: z.string().optional(),
    location: z
      .object({ latitude: z.number().optional(), longitude: z.number().optional() })
      .loose()
      .optional(),
    addressComponents: z
      .array(
        z
          .object({
            longText: z.string().optional(),
            shortText: z.string().optional(),
            types: z.array(z.string()).optional(),
          })
          .loose()
      )
      .optional(),
    editorialSummary: LocalizedTextSchema.optional(),
    websiteUri: z.string().optional(),
    regularOpeningHours: z
      .object({ periods: z.array(GooglePeriodSchema).optional() })
      .loose()
      .optional(),
    photos: z.array(z.object({ name: z.string().optional() }).loose()).optional(),
  })
  .loose()

export const GooglePlacesResponseSchema = z
  .object({ places: z.array(GooglePlaceSchema).optional() })
  .loose()

export type GooglePlace = z.infer<typeof GooglePlaceSchema>

/**
 * `primaryType` → libellé de cuisine dans le vocabulaire de l'app (celui du
 * seed). Ce qui n'est pas listé retombe sur le libellé localisé renvoyé par
 * Google, puis sur `null` : mieux vaut pas de cuisine qu'une cuisine fausse.
 */
const CUISINE_BY_PRIMARY_TYPE: Record<string, string> = {
  afghani_restaurant: 'Afghan',
  african_restaurant: 'Africain',
  american_restaurant: 'Américain',
  asian_restaurant: 'Asiatique',
  bakery: 'Boulangerie',
  bar: 'Bar',
  barbecue_restaurant: 'Barbecue',
  brazilian_restaurant: 'Brésilien',
  breakfast_restaurant: 'Petit-déjeuner',
  brunch_restaurant: 'Brunch',
  buffet_restaurant: 'Buffet',
  cafe: 'Café',
  chinese_restaurant: 'Chinois',
  coffee_shop: 'Café',
  dessert_restaurant: 'Desserts',
  dessert_shop: 'Desserts',
  diner: 'Diner',
  donut_shop: 'Donuts',
  fast_food_restaurant: 'Fast-food',
  fine_dining_restaurant: 'Gastronomique',
  french_restaurant: 'Français',
  greek_restaurant: 'Grec',
  hamburger_restaurant: 'Burgers',
  ice_cream_shop: 'Glaces',
  indian_restaurant: 'Indien',
  indonesian_restaurant: 'Indonésien',
  italian_restaurant: 'Italien',
  japanese_restaurant: 'Japonais',
  korean_restaurant: 'Coréen',
  lebanese_restaurant: 'Libanais',
  mediterranean_restaurant: 'Méditerranéen',
  mexican_restaurant: 'Mexicain',
  middle_eastern_restaurant: 'Moyen-oriental',
  pizza_restaurant: 'Pizza',
  pub: 'Pub',
  ramen_restaurant: 'Ramen',
  sandwich_shop: 'Sandwichs',
  seafood_restaurant: 'Poissons et fruits de mer',
  spanish_restaurant: 'Espagnol',
  steak_house: 'Grillades',
  sushi_restaurant: 'Japonais',
  thai_restaurant: 'Thaï',
  turkish_restaurant: 'Turc',
  vegan_restaurant: 'Vegan',
  vegetarian_restaurant: 'Végétarien',
  vietnamese_restaurant: 'Vietnamien',
}

/** L'échelle Google (5 crans dont un gratuit) ramenée au budget 1–4 de l'app. */
const PRICE_LEVEL_BY_ENUM: Record<string, number> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
}

function clean(value: string | undefined | null): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

export function cuisineFromPlace(place: GooglePlace): string | null {
  const mapped = place.primaryType ? CUISINE_BY_PRIMARY_TYPE[place.primaryType] : undefined
  return mapped ?? clean(place.primaryTypeDisplayName?.text)
}

export function priceLevelFromPlace(place: GooglePlace): number | null {
  return place.priceLevel ? (PRICE_LEVEL_BY_ENUM[place.priceLevel] ?? null) : null
}

/** Ville = `locality`, avec l'arrondissement (`sublocality`) en repli. */
export function cityFromPlace(place: GooglePlace): string | null {
  const components = place.addressComponents ?? []
  const locality = components.find((component) => component.types?.includes('locality'))
  const sublocality = components.find((component) => component.types?.includes('sublocality'))
  return clean(locality?.longText) ?? clean(sublocality?.longText)
}

/** Coordonnées, ou `null` si Google ne les donne pas ou les donne hors bornes. */
export function locationFromPlace(place: GooglePlace): GeoPoint | null {
  const lat = place.location?.latitude
  const lng = place.location?.longitude
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function hhmm(hour: number | undefined, minute: number | undefined): string {
  return `${String(hour ?? 0).padStart(2, '0')}:${String(minute ?? 0).padStart(2, '0')}`
}

/**
 * Horaires Google → forme de l'app.
 *
 * Une période sans `close` décrit un lieu ouvert en continu ce jour-là :
 * Google l'exprime en omettant la fermeture, nous par `00:00 → 24:00`.
 * Une période dont la fermeture tombe un autre jour passe simplement minuit,
 * ce que `domain/opening-hours` sait déjà lire — on garde le jour d'ouverture.
 *
 * Le fuseau n'est pas renseigné : il n'est pas demandé à Google (voir le masque
 * de champs dans `data-access/places.ts`), et `opening_hours.timezone` est
 * facultatif — à défaut, l'app raisonne dans celui du visiteur.
 */
export function openingHoursFromPlace(place: GooglePlace): OpeningHours | null {
  const periods = (place.regularOpeningHours?.periods ?? []).flatMap((period) => {
    const day = period.open?.day
    if (typeof day !== 'number') return []
    const open = hhmm(period.open?.hour, period.open?.minute)
    const close = period.close ? hhmm(period.close.hour, period.close.minute) : '24:00'
    // Google exprime « ouvert 24 h » par `open 00:00` sans fermeture ; une
    // période vide (ouverture = fermeture) ne décrirait aucune plage.
    if (open === close) return []
    return [{ day, open, close }]
  })

  return periods.length > 0 ? { periods } : null
}

/**
 * Un lieu Google exploitable, ou `null` s'il lui manque de quoi être un
 * restaurant dans l'app (identifiant ou nom). Le nom est tronqué à la
 * longueur acceptée en base plutôt que de faire échouer l'import.
 */
export function mapPlace(place: GooglePlace): PlaceResult | null {
  const placeId = clean(place.id)
  const name = clean(place.displayName?.text)?.slice(0, RESTAURANT_NAME_MAX) ?? null
  if (!placeId || !name || name.length < RESTAURANT_NAME_MIN) return null

  const website = clean(place.websiteUri)

  return {
    placeId,
    name,
    address: clean(place.formattedAddress) ?? clean(place.shortFormattedAddress),
    city: cityFromPlace(place),
    cuisineType: cuisineFromPlace(place),
    priceLevel: priceLevelFromPlace(place),
    location: locationFromPlace(place),
    description: clean(place.editorialSummary?.text),
    // La base n'accepte qu'un lien HTTP(S) : un `websiteUri` exotique est
    // écarté ici plutôt que d'être silencieusement effacé par la RPC.
    website: website && /^https?:\/\//.test(website) ? website : null,
    openingHours: openingHoursFromPlace(place),
    photoName: clean(place.photos?.[0]?.name),
    photoUrl: null,
  }
}

/** Liste de lieux exploitables, dédoublonnée par `placeId`. */
export function mapPlacesResponse(payload: unknown): PlaceResult[] {
  const parsed = GooglePlacesResponseSchema.safeParse(payload)
  if (!parsed.success) return []

  const seen = new Set<string>()
  const results: PlaceResult[] = []
  for (const place of parsed.data.places ?? []) {
    const mapped = mapPlace(place)
    if (!mapped || seen.has(mapped.placeId)) continue
    seen.add(mapped.placeId)
    results.push(mapped)
  }
  return results
}

/** Idem à partir du JSON brut d'un détail de lieu (`GET /v1/places/{id}`). */
export function mapPlaceDetails(payload: unknown): PlaceResult | null {
  const parsed = GooglePlaceSchema.safeParse(payload)
  return parsed.success ? mapPlace(parsed.data) : null
}

/** Clé de cache d'une recherche : requête normalisée + biais arrondi (~1 km). */
export function placesCacheKey(input: {
  query: string
  latitude?: number | null
  longitude?: number | null
}): string {
  const query = input.query.trim().toLowerCase().replace(/\s+/g, ' ')
  const round = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : ''
  return `${query}|${round(input.latitude)}|${round(input.longitude)}`
}
