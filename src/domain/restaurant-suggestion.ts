import { z } from 'zod'

import { RESTAURANT_CUISINE_MAX, RESTAURANT_TAGS, type RestaurantTag } from './schemas/restaurant'

/**
 * Ce que l'IA propose pour compléter la fiche d'un resto ajouté à la main.
 *
 * Une proposition, jamais une écriture : elle remplit le formulaire, la
 * personne voit, corrige ou efface, et c'est elle qui clique « Ajouter ».
 * Rien de ce qui suit n'atteint la base sans être passé sous ses yeux.
 *
 * Même règle que les contraintes alimentaires — se taire plutôt que rassurer
 * à tort : un champ dont la source n'est pas sûre revient vide, et un régime
 * n'est proposé que s'il est affiché par le resto lui-même.
 */
export interface RestaurantSuggestion {
  cuisineType: string | null
  priceLevel: number | null
  tags: RestaurantTag[]
}

/**
 * Forme que le modèle doit remplir. Le schéma JSON envoyé à l'API en est la
 * transcription ; ce schéma Zod revérifie la réponse, qui reste une donnée
 * externe.
 */
export const SuggestionToolInputSchema = z.object({
  found: z.boolean(),
  cuisine_type: z.string().nullable(),
  price_level: z.number().nullable(),
  tags: z.array(z.string()),
})

export const SUGGESTION_TOOL_INPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'cuisine_type', 'price_level', 'tags'],
  properties: {
    found: {
      type: 'boolean',
      description:
        'true only if you found this specific restaurant (name and place match). false otherwise.',
    },
    cuisine_type: {
      type: ['string', 'null'],
      description:
        'Cuisine in French, one or two words, capitalised (e.g. "Libanais", "Japonais", "Burgers", "Pizza"). null if unsure.',
    },
    price_level: {
      type: ['integer', 'null'],
      description:
        'Typical lunch price per person: 1 = under 15 €, 2 = 15-30 €, 3 = 30-60 €, 4 = above 60 €. null if no price information was found.',
    },
    tags: {
      type: 'array',
      items: { type: 'string', enum: [...RESTAURANT_TAGS] },
      description:
        'Only diets the restaurant explicitly states it serves (menu, website, certification). Never infer from the cuisine alone: a Lebanese restaurant is not halal by default. Empty if unsure.',
    },
  },
} as const

const EMPTY: RestaurantSuggestion = { cuisineType: null, priceLevel: null, tags: [] }

/**
 * Ramène la réponse du modèle au vocabulaire du carnet. Tout ce qui ne
 * colle pas est jeté champ par champ plutôt que de faire échouer l'ensemble :
 * une cuisine sûre vaut d'être proposée même si le budget est fantaisiste.
 */
export function normalizeSuggestion(input: unknown): RestaurantSuggestion | null {
  const parsed = SuggestionToolInputSchema.safeParse(input)
  if (!parsed.success || !parsed.data.found) return null

  const cuisine = parsed.data.cuisine_type?.trim() ?? ''
  const price = parsed.data.price_level
  const tags = parsed.data.tags.filter((tag): tag is RestaurantTag =>
    (RESTAURANT_TAGS as readonly string[]).includes(tag)
  )

  const suggestion: RestaurantSuggestion = {
    cuisineType: cuisine.length > 0 && cuisine.length <= RESTAURANT_CUISINE_MAX ? cuisine : null,
    priceLevel:
      price !== null && Number.isInteger(price) && price >= 1 && price <= 4 ? price : null,
    tags: [...new Set(tags)],
  }
  return isEmptySuggestion(suggestion) ? null : suggestion
}

export function isEmptySuggestion(suggestion: RestaurantSuggestion): boolean {
  return (
    suggestion.cuisineType === EMPTY.cuisineType &&
    suggestion.priceLevel === EMPTY.priceLevel &&
    suggestion.tags.length === 0
  )
}

/** Champs du formulaire que la personne a déjà touchés : l'IA ne les réécrit jamais. */
export interface TouchedFields {
  cuisineType: boolean
  priceLevel: boolean
  tags: boolean
}

/**
 * Ce que la proposition remplit vraiment, une fois retirés les champs que la
 * personne a déjà renseignés. Ce qu'elle a écrit gagne toujours, même vide :
 * effacer une cuisine proposée, c'est aussi un choix.
 */
export function applicableSuggestion(
  suggestion: RestaurantSuggestion,
  touched: TouchedFields
): RestaurantSuggestion {
  return {
    cuisineType: touched.cuisineType ? null : suggestion.cuisineType,
    priceLevel: touched.priceLevel ? null : suggestion.priceLevel,
    tags: touched.tags ? [] : suggestion.tags,
  }
}

/** Clé de cache : même resto, même réponse, quelle que soit la casse ou les espaces. */
export function suggestionCacheKey(name: string, address: string | null): string {
  const clean = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${clean(name)}|${clean(address ?? '')}`
}
