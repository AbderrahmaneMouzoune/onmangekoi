import { z } from 'zod'

import { omkMessage, type ErrorCode } from '@/domain/errors'

export const RESTAURANT_NAME_MIN = 2
export const RESTAURANT_NAME_MAX = 100
export const RESTAURANT_CUISINE_MAX = 40
export const RESTAURANT_ADDRESS_MAX = 200
export const RESTAURANT_CITY_MAX = 80

/** Budget indicatif, de « € » à « €€€€ ». */
export const PRICE_LEVELS = [1, 2, 3, 4] as const
export const PRICE_LEVEL_LABELS: Record<number, string> = { 1: '€', 2: '€€', 3: '€€€', 4: '€€€€' }

/**
 * Régimes qu'un resto sait servir. Même liste qu'en base
 * (`restaurant_tag_values()`), qui la fait respecter par contrainte : ajouter
 * un régime demande donc une migration, pas seulement une ligne ici.
 *
 * L'ordre est celui d'affichage — la base, elle, range les régimes par ordre
 * alphabétique pour que deux restos tagués pareil aient le même tableau. Les
 * libellés sont dans les messages (`restaurants.tags.<régime>`).
 */
export const RESTAURANT_TAGS = ['vegetarian', 'vegan', 'halal', 'kosher', 'gluten_free'] as const
export type RestaurantTag = (typeof RESTAURANT_TAGS)[number]

/** Régimes d'un formulaire : absents, dédoublonnés, jamais inventés. */
export const RestaurantTagsSchema = z
  .union([z.array(z.enum(RESTAURANT_TAGS)), z.null()])
  .default(null)
  .transform((value) => [...new Set(value ?? [])])

/**
 * Champ facultatif venant d'un formulaire : `FormData.get` renvoie `null`
 * quand l'input est absent et `''` quand il est vide. Les deux valent
 * « non renseigné », et la valeur normalisée est `null` — jamais `''`, pour
 * ne pas stocker de chaîne vide en base. Le `.default(null)` rend aussi la
 * clé facultative dans l'objet parent.
 */
function optionalText(max: number, code: ErrorCode) {
  return z
    .union([z.string(), z.null()])
    .default(null)
    .transform((value) => (value === null ? '' : value.trim()))
    .pipe(z.string().max(max, omkMessage(code)))
    .transform((value) => (value.length > 0 ? value : null))
}

export const RestaurantNameSchema = z
  .string()
  .trim()
  .min(RESTAURANT_NAME_MIN, omkMessage('invalid_restaurant_name'))
  .max(RESTAURANT_NAME_MAX, omkMessage('invalid_restaurant_name'))

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
  cuisineType: optionalText(RESTAURANT_CUISINE_MAX, 'cuisine_too_long'),
  address: optionalText(RESTAURANT_ADDRESS_MAX, 'address_too_long'),
  city: optionalText(RESTAURANT_CITY_MAX, 'city_too_long'),
  priceLevel: PriceLevelSchema,
  tags: RestaurantTagsSchema,
})

/** Recherche de doublons : au moins deux caractères, sinon rien à comparer. */
export const SimilarRestaurantsSchema = z.object({
  name: z.string().trim().min(RESTAURANT_NAME_MIN).max(RESTAURANT_NAME_MAX),
})

export type CreateRestaurantInput = z.infer<typeof CreateRestaurantSchema>
