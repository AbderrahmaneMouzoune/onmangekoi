import { z } from 'zod'

export const PLACES_QUERY_MIN = 2
export const PLACES_QUERY_MAX = 120

/** Identifiant Google d'un lieu : opaque, mais borné et sans espace. */
export const PlaceIdSchema = z
  .string()
  .trim()
  .min(1, 'Lieu invalide')
  .max(255, 'Lieu invalide')
  .regex(/^[\w-]+$/, 'Lieu invalide')

/** Corps de `POST /api/places/search`. Le biais géographique est optionnel. */
export const SearchPlacesSchema = z.object({
  query: z
    .string()
    .trim()
    .min(PLACES_QUERY_MIN, 'Entre au moins deux caractères')
    .max(PLACES_QUERY_MAX, 'Recherche trop longue'),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
})

export const ImportPlaceSchema = z.object({ placeId: PlaceIdSchema })

export type SearchPlacesInput = z.infer<typeof SearchPlacesSchema>
