import { z } from 'zod'

import { PriceLevelSchema, RESTAURANT_TAGS, RestaurantTagsSchema } from './restaurant'

/**
 * « Ce que je ne peux pas manger », depuis `/account` (issue #60). Tout est
 * facultatif : aucune case cochée et « Pas de plafond » reviennent à tout
 * retirer — c'est ce qui rend la déclaration réversible.
 *
 * Les régimes ressortent dans l'ordre du catalogue, comme ceux des filtres :
 * deux envois qui disent la même chose donnent le même objet.
 */
export const FoodConstraintsSchema = z.object({
  tags: RestaurantTagsSchema.transform((tags) =>
    RESTAURANT_TAGS.filter((tag) => tags.includes(tag))
  ),
  maxPriceLevel: PriceLevelSchema,
})

export type FoodConstraintsInput = z.infer<typeof FoodConstraintsSchema>
