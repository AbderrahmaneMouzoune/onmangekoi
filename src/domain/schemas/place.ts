import { z } from 'zod'

import { omkMessage } from '@/domain/errors'

export const PLACES_QUERY_MIN = 2
export const PLACES_QUERY_MAX = 120

/** Identifiant Google d'un lieu : opaque, mais borné et sans espace. */
export const PlaceIdSchema = z
  .string()
  .trim()
  .min(1, omkMessage('invalid_place'))
  .max(255, omkMessage('invalid_place'))
  .regex(/^[\w-]+$/, omkMessage('invalid_place'))

const LatitudeSchema = z.number().min(-90).max(90)
const LongitudeSchema = z.number().min(-180).max(180)

export function hasPosition(input: {
  latitude?: number | null
  longitude?: number | null
}): input is { latitude: number; longitude: number } {
  return typeof input.latitude === 'number' && typeof input.longitude === 'number'
}

/**
 * Corps de `POST /api/places/search`.
 *
 * Deux façons de chercher, et une seule route : avec un texte (au moins deux
 * caractères, la position ne fait que biaiser les résultats), ou sans texte
 * mais avec une position — Google renvoie alors les restos les plus proches.
 * Ni l'un ni l'autre, et il n'y a rien à demander. Le jeton de page, lui,
 * accompagne exactement la même demande pour en obtenir la suite.
 */
export const SearchPlacesSchema = z
  .object({
    query: z.string().trim().max(PLACES_QUERY_MAX, omkMessage('search_too_long')).default(''),
    latitude: LatitudeSchema.nullish(),
    longitude: LongitudeSchema.nullish(),
    /** Jeton opaque rendu par Google avec la page précédente : « voir plus ». */
    pageToken: z
      .string()
      .trim()
      .min(1, omkMessage('invalid_request'))
      .max(4096, omkMessage('invalid_request'))
      .regex(/^\S+$/, omkMessage('invalid_request'))
      .nullish(),
  })
  .refine((data) => data.query.length >= PLACES_QUERY_MIN || hasPosition(data), {
    message: omkMessage('search_too_short'),
    path: ['query'],
  })

export const ImportPlaceSchema = z.object({ placeId: PlaceIdSchema })

/**
 * Plafond d'un amorçage de quartier : vingt lieux, soit exactement une page
 * Google. Le navigateur ne le choisit pas — il n'envoie qu'une position, et
 * le serveur coupe la liste lui-même. Demander la page suivante doublerait
 * la facture pour des restos de plus en plus loin.
 */
export const NEIGHBOURHOOD_IMPORT_MAX = 20

/**
 * Corps d'un amorçage : une position, rien d'autre. Elle vient de
 * `navigator.geolocation`, donc d'un geste explicite — sans elle, l'action
 * n'est même pas proposée.
 */
export const SeedNeighbourhoodSchema = z.object({
  latitude: LatitudeSchema,
  longitude: LongitudeSchema,
})

export type SeedNeighbourhoodInput = z.infer<typeof SeedNeighbourhoodSchema>

export type SearchPlacesInput = z.infer<typeof SearchPlacesSchema>
