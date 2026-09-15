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
 * Ni l'un ni l'autre, et il n'y a rien à demander.
 */
export const SearchPlacesSchema = z
  .object({
    query: z.string().trim().max(PLACES_QUERY_MAX, 'Recherche trop longue').default(''),
    latitude: LatitudeSchema.nullish(),
    longitude: LongitudeSchema.nullish(),
  })
  .refine((data) => data.query.length >= PLACES_QUERY_MIN || hasPosition(data), {
    message: 'Entre au moins deux caractères, ou autorise ta position.',
    path: ['query'],
  })

export const ImportPlaceSchema = z.object({ placeId: PlaceIdSchema })

export type SearchPlacesInput = z.infer<typeof SearchPlacesSchema>
