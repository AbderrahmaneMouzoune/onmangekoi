import { z } from 'zod'

export const RESTAURANT_NAME_MIN = 2
export const RESTAURANT_NAME_MAX = 100
export const RESTAURANT_CUISINE_MAX = 40
export const RESTAURANT_ADDRESS_MAX = 200
export const RESTAURANT_CITY_MAX = 80

/** Budget indicatif, de « € » à « €€€€ ». */
export const PRICE_LEVELS = [1, 2, 3, 4] as const
export const PRICE_LEVEL_LABELS: Record<number, string> = { 1: '€', 2: '€€', 3: '€€€', 4: '€€€€' }

/**
 * Champ facultatif venant d'un formulaire : `FormData.get` renvoie `null`
 * quand l'input est absent et `''` quand il est vide. Les deux valent
 * « non renseigné », et la valeur normalisée est `null` — jamais `''`, pour
 * ne pas stocker de chaîne vide en base. Le `.default(null)` rend aussi la
 * clé facultative dans l'objet parent.
 */
function optionalText(max: number, message: string) {
  return z
    .union([z.string(), z.null()])
    .default(null)
    .transform((value) => (value === null ? '' : value.trim()))
    .pipe(z.string().max(max, message))
    .transform((value) => (value.length > 0 ? value : null))
}

export const RestaurantNameSchema = z
  .string()
  .trim()
  .min(RESTAURANT_NAME_MIN, `Le nom doit faire au moins ${RESTAURANT_NAME_MIN} caractères`)
  .max(RESTAURANT_NAME_MAX, `Le nom ne peut pas dépasser ${RESTAURANT_NAME_MAX} caractères`)

/** Accepte le nombre, la chaîne d'un champ de formulaire et l'absence de choix. */
export const PriceLevelSchema = z
  .union([z.string(), z.number(), z.null()])
  .default(null)
  .transform((value) => {
    if (value === null || value === '') return null
    return typeof value === 'number' ? value : Number(value)
  })
  .pipe(z.number().int().min(1).max(4).nullable())

export const CreateRestaurantSchema = z.object({
  name: RestaurantNameSchema,
  cuisineType: optionalText(
    RESTAURANT_CUISINE_MAX,
    `Le type de cuisine ne peut pas dépasser ${RESTAURANT_CUISINE_MAX} caractères`
  ),
  address: optionalText(
    RESTAURANT_ADDRESS_MAX,
    `L’adresse ne peut pas dépasser ${RESTAURANT_ADDRESS_MAX} caractères`
  ),
  city: optionalText(
    RESTAURANT_CITY_MAX,
    `La ville ne peut pas dépasser ${RESTAURANT_CITY_MAX} caractères`
  ),
  priceLevel: PriceLevelSchema,
})

/** Recherche de doublons : au moins deux caractères, sinon rien à comparer. */
export const SimilarRestaurantsSchema = z.object({
  name: z.string().trim().min(RESTAURANT_NAME_MIN).max(RESTAURANT_NAME_MAX),
})

export type CreateRestaurantInput = z.infer<typeof CreateRestaurantSchema>
