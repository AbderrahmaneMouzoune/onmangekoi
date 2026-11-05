import 'server-only'

import { revalidateTag } from 'next/cache'
import { getLocale } from 'next-intl/server'
import { z } from 'zod'

import { mcpCreateRestaurant, mcpFindRestaurants, mcpImportPlace } from '@/data-access/mcp'
import { getPlaceDetails, isPlacesSearchEnabled, searchPlaces } from '@/data-access/places'
import { getPublicResults } from '@/data-access/public-results'
import { getRecentWinners } from '@/data-access/recent-winners'
import {
  getRestaurantCatalogPage,
  getRestaurantsByIds,
  RESTAURANTS_CACHE_PROFILE,
  RESTAURANTS_CACHE_TAG,
  snapOrigin,
} from '@/data-access/restaurants'
import { getRestaurantSuggestions } from '@/data-access/suggestions'
import { AppError, omkCode } from '@/domain/errors'
import { isOpenNow, parseOpeningHours } from '@/domain/opening-hours'
import { PlaceIdSchema } from '@/domain/schemas/place'
import {
  CreateRestaurantSchema,
  RESTAURANT_ADDRESS_MAX,
  RESTAURANT_CITY_MAX,
  RESTAURANT_CUISINE_MAX,
  RESTAURANT_TAGS,
  RestaurantNameSchema,
  RestaurantSearchSchema,
} from '@/domain/schemas/restaurant'
import { parseResultsParam } from '@/domain/share'
import { SUGGESTION_SIZE } from '@/domain/suggestions'
import { directionsUrl, parseGeoPoint } from '@/lib/maps'
import { runSharedTool, runTool } from '@/lib/mcp/context'
import { publicResultsUrl } from '@/lib/site'

import type { McpAccess, McpFoundRestaurant, McpRestaurant } from '@/data-access/mcp'
import type { PublicResultRow, Restaurant } from '@/data-access/models'
import type { PlaceResult } from '@/domain/places'
import type { McpServer } from '@modelcontextprotocol/server'

/**
 * Tools du catalogue : chercher (en filtrant, ou par nom approché), ajouter —
 * depuis Google ou à la main —, se faire suggérer des restaurants, et lire un
 * classement public.
 *
 * Tout ce qui ne dépend pas de l'historique est ouvert aux deux modes de
 * connexion (`runSharedTool`) : les écritures passent par les RPC `mcp_*`,
 * qui agissent pour le porteur d'un jeton personnel comme pour `auth.uid()`.
 * Seules les suggestions, tirées des sessions passées, exigent OAuth.
 *
 * Ce module porte aussi les briques communes aux autres domaines MCP — la
 * forme d'un restaurant rendue au modèle, la lecture d'un identifiant collé
 * sous forme de lien, la validation d'une entrée par un schéma du domaine —
 * parce que le restaurant est la donnée que tous les tools se renvoient.
 */

// ─── Briques communes ─────────────────────────────────────────────

/**
 * Le restaurant tel qu'un agent le voit. Liste blanche : rien de ce qui
 * désigne une personne (`created_by`, l'uuid de qui l'a ajouté à la main) ni
 * de ce qui ne sert qu'à l'app (`place_id`, `photo_url`, horaires bruts). Les
 * horaires sont résumés en `open_now`, la position en lien d'itinéraire : ce
 * qu'un agent sait exploiter sans réimplémenter la règle.
 */
export const RestaurantOutputSchema = z.object({
  id: z.string().describe('Restaurant id (uuid). Pass it to list and session tools.'),
  name: z.string(),
  cuisine_type: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  price_level: z.number().int().nullable().describe('1 (€) to 4 (€€€€), null when unknown.'),
  tags: z.array(z.string()).describe(`Diets the restaurant serves: ${RESTAURANT_TAGS.join(', ')}.`),
  description: z.string().nullable(),
  website: z.string().nullable(),
  location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  open_now: z
    .boolean()
    .nullable()
    .describe('Whether it is open right now, null when opening hours are unknown.'),
  directions_url: z.string().nullable().describe('Google Maps directions link.'),
})

export type RestaurantOutput = z.infer<typeof RestaurantOutputSchema>

type RestaurantLike = Pick<
  Restaurant,
  | 'id'
  | 'name'
  | 'cuisine_type'
  | 'address'
  | 'city'
  | 'price_level'
  | 'tags'
  | 'description'
  | 'website'
  | 'location'
  | 'opening_hours'
>

/** Ligne de la base → forme MCP. `now` est injectable pour les tests. */
export function toRestaurantOutput(
  restaurant: RestaurantLike,
  now: Date = new Date()
): RestaurantOutput {
  return {
    id: restaurant.id,
    name: restaurant.name,
    cuisine_type: restaurant.cuisine_type,
    address: restaurant.address,
    city: restaurant.city,
    price_level: restaurant.price_level,
    tags: restaurant.tags,
    description: restaurant.description,
    website: restaurant.website,
    location: parseGeoPoint(restaurant.location),
    open_now: isOpenNow(parseOpeningHours(restaurant.opening_hours), now),
    directions_url: directionsUrl(restaurant),
  }
}

/**
 * Restaurant tel que le rendent les RPC `mcp_*` (déjà mis en forme en base,
 * champs nuls retirés), repassé par une liste blanche : ni `source` ni
 * `google_place_id`, qui ne servent qu'à l'app. Les champs absents
 * redeviennent `null`, pour une forme stable d'un appel à l'autre.
 */
export const CatalogRestaurantOutputSchema = z.object({
  id: z.string().describe('Restaurant id (uuid). Pass it to list and session tools.'),
  name: z.string(),
  cuisine_type: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  price_level: z.number().int().nullable().describe('1 (€) to 4 (€€€€), null when unknown.'),
  tags: z.array(z.string()).describe(`Diets the restaurant serves: ${RESTAURANT_TAGS.join(', ')}.`),
  website: z.string().nullable(),
})

export type CatalogRestaurantOutput = z.infer<typeof CatalogRestaurantOutputSchema>

export function toCatalogRestaurant(restaurant: McpRestaurant): CatalogRestaurantOutput {
  return {
    id: restaurant.id,
    name: restaurant.name,
    cuisine_type: restaurant.cuisine_type ?? null,
    address: restaurant.address ?? null,
    city: restaurant.city ?? null,
    price_level: restaurant.price_level ?? null,
    tags: restaurant.tags ?? [],
    website: restaurant.website ?? null,
  }
}

/**
 * Résultat de `find_restaurant` : le restaurant, plus les listes de
 * l'utilisateur qui le contiennent déjà — de quoi éviter un doublon sans
 * second appel.
 */
export const FoundRestaurantOutputSchema = CatalogRestaurantOutputSchema.extend({
  in_my_lists: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .describe("The user's lists that already contain it (empty when none)."),
})

export function toFoundRestaurant(
  restaurant: McpFoundRestaurant
): z.infer<typeof FoundRestaurantOutputSchema> {
  return {
    ...toCatalogRestaurant(restaurant),
    in_my_lists: restaurant.in_my_lists.map((list) => ({ id: list.id, name: list.name })),
  }
}

/** Un lieu Google tel qu'on le propose : de quoi le reconnaître, et son id. */
export const GooglePlaceOutputSchema = z.object({
  google_place_id: z.string().describe('Pass it to add_restaurant as `googlePlaceId`.'),
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  cuisine_type: z.string().nullable(),
})

export function toGooglePlace(place: PlaceResult): z.infer<typeof GooglePlaceOutputSchema> {
  return {
    google_place_id: place.placeId,
    name: place.name,
    address: place.address,
    city: place.city,
    cuisine_type: place.cuisineType,
  }
}

/**
 * Le catalogue est en cache pour tout le monde (`RESTAURANTS_CACHE_TAG`) : un
 * ajout doit s'y voir tout de suite, comme après la Server Action.
 */
export function revalidateCatalog(): void {
  revalidateTag(RESTAURANTS_CACHE_TAG, RESTAURANTS_CACHE_PROFILE)
}

/**
 * Importe un lieu Google dans le catalogue. La fiche est relue chez Google
 * côté serveur, dans la langue de la requête : l'agent ne fournit que l'id,
 * jamais les champs écrits en base. La langue vient de `getLocale()` — dans
 * un route handler, le cookie `NEXT_LOCALE` puis `Accept-Language` —, le
 * serveur MCP étant créé sans accès à la requête.
 */
export async function importGooglePlace(
  access: McpAccess,
  placeId: string
): Promise<McpRestaurant> {
  if (!isPlacesSearchEnabled()) throw new AppError('places_not_configured')
  const place = await getPlaceDetails(placeId, await getLocale())
  if (!place) throw new AppError('place_gone')
  const restaurant = await mcpImportPlace(access, place)
  revalidateCatalog()
  return restaurant
}

/** Recherche Google dans la langue de la requête (voir `importGooglePlace`). */
export async function searchGooglePlaces(query: string): Promise<PlaceResult[]> {
  const page = await searchPlaces({ locale: await getLocale(), query })
  return page.places
}

/**
 * Un agent recopie aussi volontiers le lien que l'app lui a donné que le code
 * seul. On ne garde que le dernier segment du chemin — c'est lui qui porte le
 * code dans toutes les URL de l'app (`/l/<code>`, `/lists/<code>`,
 * `/r/<code>`) — et le parseur du domaine fait le reste (casse, séparateurs,
 * slug d'un ancien lien).
 */
export function lastPathSegment(raw: string): string {
  const value = raw.trim()
  if (!/^https?:\/\//i.test(value) && !value.includes('/')) return value
  try {
    const url = new URL(value, 'http://placeholder.local')
    return url.pathname.split('/').filter(Boolean).at(-1) ?? ''
  } catch {
    return ''
  }
}

/**
 * Valide une entrée avec un schéma du domaine, celui des formulaires : il
 * normalise (espaces, valeurs vides, ordre des régimes) exactement comme
 * l'app. Un refus porteur d'un code (`omk:…`) remonte tel quel pour être
 * traduit ; un refus de Zod lui-même devient `invalid_request`.
 */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  const issue = parsed.error.issues[0]
  throw issue && omkCode(issue) ? new Error(issue.message) : new AppError('invalid_request')
}

// ─── search_restaurants ───────────────────────────────────────────

/**
 * Les bornes viennent de `RestaurantSearchSchema` — celui du
 * `RestaurantPicker` — et seules les descriptions s'ajoutent ici : tout est
 * déjà en types JSON (nombres, tableaux, objet), sans coercition de formulaire.
 */
const SearchInputSchema = z.object({
  query: RestaurantSearchSchema.shape.query.describe(
    'Free text matched against the restaurant name and cuisine (not the city). Empty string lists the whole catalog.'
  ),
  tags: RestaurantSearchSchema.shape.tags.describe(
    'Diets the restaurant must ALL serve (e.g. ["vegetarian", "halal"]).'
  ),
  priceMax: RestaurantSearchSchema.shape.priceMax.describe(
    'Maximum price level, 1 (€) to 4 (€€€€). Restaurants with an unknown price are excluded when set; null disables the filter.'
  ),
  withinKm: RestaurantSearchSchema.shape.withinKm.describe(
    'Radius in km around `origin` (max 50); results are then sorted nearest first. Ignored without `origin`.'
  ),
  origin: RestaurantSearchSchema.shape.origin.describe(
    'Where the user is, to filter by distance. Used for this request only, never stored.'
  ),
  offset: RestaurantSearchSchema.shape.offset.describe(
    'Pagination: pass the previous `nextOffset` to get the next page.'
  ),
})

const SearchOutputSchema = z.object({
  items: z.array(RestaurantOutputSchema),
  hasMore: z.boolean(),
  nextOffset: z.number().int(),
})

// ─── find_restaurant / search_google_places ───────────────────────

/** Au-delà, l'agent ne lira pas la liste : il précisera la ville. */
const FIND_LIMIT = 8
const GOOGLE_LIMIT = 10

const FindInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .describe('Restaurant name as the user said it ("la ba"), or a cuisine.'),
  city: z
    .string()
    .trim()
    .max(RESTAURANT_CITY_MAX)
    .nullable()
    .optional()
    .describe('City, to break ties between homonyms. Omit or null when unknown.'),
})

const FindOutputSchema = z.object({ restaurants: z.array(FoundRestaurantOutputSchema) })

const GoogleSearchInputSchema = z.object({
  query: z.string().trim().min(2).max(120).describe('Name, ideally with the city: "La Ba Paris".'),
})

const GoogleSearchOutputSchema = z.object({
  places: z.array(
    GooglePlaceOutputSchema.extend({
      rating: z.number().nullable().describe('Google rating out of 5, null when unknown.'),
    })
  ),
})

// ─── add_restaurant ───────────────────────────────────────────────

/**
 * Deux façons d'ajouter : depuis Google (`googlePlaceId`, préférée — adresse,
 * horaires et photo viennent avec), ou à la main, avec les mêmes champs que le
 * formulaire, en types JSON stricts : le schéma du domaine accepte aussi les
 * chaînes de `FormData` (« 2 » pour un budget), ce qu'un agent n'a aucune
 * raison d'envoyer. `CreateRestaurantSchema` repasse ensuite derrière pour
 * normaliser comme l'app.
 */
const AddRestaurantInputSchema = z.object({
  googlePlaceId: PlaceIdSchema.nullable()
    .optional()
    .describe(
      'From search_google_places or remember_restaurant. When set, other fields are ignored.'
    ),
  name: RestaurantNameSchema.optional().describe(
    'Manual addition: restaurant name (2 to 100 characters). Required without googlePlaceId.'
  ),
  cuisineType: z
    .string()
    .trim()
    .max(RESTAURANT_CUISINE_MAX)
    .nullable()
    .optional()
    .describe('Cuisine, e.g. "Japanese", "Pizza". Omit or null when unknown.'),
  address: z
    .string()
    .trim()
    .max(RESTAURANT_ADDRESS_MAX)
    .nullable()
    .optional()
    .describe('Street address. Omit or null when unknown.'),
  city: z.string().trim().max(RESTAURANT_CITY_MAX).nullable().optional(),
  priceLevel: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullable()
    .optional()
    .describe('1 (€) to 4 (€€€€). Omit or null when unknown.'),
  tags: z
    .array(z.enum(RESTAURANT_TAGS))
    .max(RESTAURANT_TAGS.length)
    .nullable()
    .optional()
    .describe('Diets the restaurant serves. Only declare what you know.'),
})

const AddRestaurantOutputSchema = z.object({ restaurant: CatalogRestaurantOutputSchema })

// ─── suggest_restaurants ──────────────────────────────────────────

/** Borne de la RPC `suggest_restaurants` : au-delà, elle tronque d'elle-même. */
const SUGGESTION_MAX = 10

const SuggestInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(SUGGESTION_MAX)
    .default(SUGGESTION_SIZE)
    .describe('How many suggestions (1 to 10).'),
})

const SuggestOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      restaurant: RestaurantOutputSchema,
      reason: z
        .enum(['recent', 'never_proposed'])
        .describe(
          '"recent": seen in a recent session of the user without winning; "never_proposed": never proposed to the user yet.'
        ),
      source: z
        .enum(['history', 'mine', 'catalog'])
        .describe(
          '"history": from past sessions; "mine": from the user\'s lists or additions; "catalog": newest in the catalog.'
        ),
    })
  ),
  recentWinners: z
    .array(z.object({ id: z.string(), name: z.string(), lastWonAt: z.string() }))
    .describe('Restaurants that recently won a session of the user: avoid proposing them again.'),
})

// ─── get_public_results ───────────────────────────────────────────

const GetPublicResultsInputSchema = z.object({
  results: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe('The 10-character public results code, or the public link (…/r/<code>).'),
})

const PublicResultRowSchema = z.object({
  rank: z.number().int(),
  restaurant_name: z.string(),
  cuisine_type: z.string().nullable(),
  city: z.string().nullable(),
  score: z.number(),
  votes_count: z.number().int(),
  decided: z.boolean().describe('True for the restaurant the host confirmed the group goes to.'),
})

const GetPublicResultsOutputSchema = z.object({
  sessionName: z.string(),
  closedAt: z.string().nullable(),
  participantCount: z.number().int(),
  podium: z.array(PublicResultRowSchema).describe('Ranks 1 to 3 of the vote.'),
  decision: PublicResultRowSchema.nullable().describe(
    'Restaurant confirmed by the host, possibly outside the podium; null if none yet.'
  ),
  url: z.string(),
})

/** Ligne du podium public → forme MCP (sans `photo_url`, inutile à un agent). */
export function toPublicResultRow(row: PublicResultRow): z.infer<typeof PublicResultRowSchema> {
  return {
    rank: row.rank,
    restaurant_name: row.restaurant_name,
    cuisine_type: row.cuisine_type,
    city: row.city,
    score: row.score,
    votes_count: row.votes_count,
    decided: row.decided,
  }
}

// ─── Enregistrement ───────────────────────────────────────────────

export function registerCatalogTools(server: McpServer): void {
  const placesEnabled = isPlacesSearchEnabled()

  server.registerTool(
    'search_restaurants',
    {
      title: 'Search restaurants',
      description:
        'Search the shared onmangekoi restaurant catalog by text, diets, budget and distance. ' +
        'Use it to browse or filter; to look up a restaurant the user named, prefer ' +
        'find_restaurant (tolerant to typos, and tells which lists already hold it). ' +
        'Results are paginated by 20: call again with `offset = nextOffset` while `hasMore` is true.',
      inputSchema: SearchInputSchema,
      outputSchema: SearchOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runSharedTool(ctx.http?.authInfo, async () => {
        // Cache partagé du catalogue, comme le `RestaurantPicker` : la
        // position est arrondie avant d'entrer dans la clé de cache.
        const page = await getRestaurantCatalogPage({ ...args, origin: snapOrigin(args.origin) })
        const now = new Date()
        return {
          items: page.items.map((restaurant) => toRestaurantOutput(restaurant, now)),
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
        }
      })
  )

  server.registerTool(
    'find_restaurant',
    {
      title: 'Find a restaurant in the app',
      description:
        'Look a restaurant up in the shared catalog by name or cuisine, tolerant to typos and ' +
        "accents ('la ba' finds 'La Ba' and 'La Baraka'). Each result says which of the user's " +
        'lists already contain it (`in_my_lists`). Always call it before add_restaurant: the ' +
        'catalog is shared by everyone, duplicates hurt.',
      inputSchema: FindInputSchema,
      outputSchema: FindOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runSharedTool(ctx.http?.authInfo, async ({ access }) => {
        const restaurants = await mcpFindRestaurants(access, {
          query: args.query,
          city: args.city ?? null,
          limit: FIND_LIMIT,
        })
        return { restaurants: restaurants.map(toFoundRestaurant) }
      })
  )

  // Sans clé Google, l'outil n'existe pas : mieux vaut ne pas le proposer que
  // le voir échouer à chaque appel.
  if (placesEnabled) {
    server.registerTool(
      'search_google_places',
      {
        title: 'Search Google for a restaurant',
        description:
          'Search Google Places for a restaurant that find_restaurant did not find in the app. ' +
          'Returns google_place_id values to pass to add_restaurant (`googlePlaceId`).',
        inputSchema: GoogleSearchInputSchema,
        outputSchema: GoogleSearchOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (args, ctx) =>
        runSharedTool(ctx.http?.authInfo, async () => {
          const places = await searchGooglePlaces(args.query)
          return {
            places: places
              .slice(0, GOOGLE_LIMIT)
              .map((place) => ({ ...toGooglePlace(place), rating: place.rating })),
          }
        })
    )
  }

  server.registerTool(
    'add_restaurant',
    {
      title: 'Add a restaurant',
      description:
        'Add a restaurant to the shared catalog, visible to every onmangekoi user: from Google ' +
        '(`googlePlaceId`, preferred: address, hours and photo come with it) or by hand (`name`, ' +
        'plus the fields you are sure of). Only after find_restaurant found nothing. It cannot ' +
        'be edited or removed through this connector. Does not file it in a list: call ' +
        'add_to_list next with the returned id.',
      inputSchema: AddRestaurantInputSchema,
      outputSchema: AddRestaurantOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        // Google n'est sollicité que s'il est configuré.
        openWorldHint: placesEnabled,
      },
    },
    async (args, ctx) =>
      runSharedTool(ctx.http?.authInfo, async ({ access }) => {
        if (args.googlePlaceId) {
          return {
            restaurant: toCatalogRestaurant(await importGooglePlace(access, args.googlePlaceId)),
          }
        }
        if (!args.name) throw new AppError('invalid_restaurant_name')
        const input = parseInput(CreateRestaurantSchema, {
          name: args.name,
          cuisineType: args.cuisineType,
          address: args.address,
          city: args.city,
          priceLevel: args.priceLevel,
          tags: args.tags,
        })
        const restaurant = await mcpCreateRestaurant(access, input)
        // Même invalidation que l'action : sans elle, le resto resterait
        // introuvable des heures dans le catalogue en cache.
        revalidateCatalog()
        return { restaurant: toCatalogRestaurant(restaurant) }
      })
  )

  server.registerTool(
    'suggest_restaurants',
    {
      title: 'Suggest restaurants',
      description:
        "Personalised starting selection for a new session, built from the user's own history: " +
        'restaurants seen recently in their sessions (recent winners excluded) plus one never ' +
        'proposed. Empty when the user has no session history yet — fall back to ' +
        'search_restaurants then. Also returns the recent winners to avoid.',
      inputSchema: SuggestInputSchema,
      outputSchema: SuggestOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, async ({ supabase }) => {
        const [suggestions, winners] = await Promise.all([
          getRestaurantSuggestions(supabase, args.limit),
          getRecentWinners(supabase),
        ])
        // `recent_winners` ne rend que des ids : on y joint les noms, seule
        // chose qu'un agent puisse dire à l'utilisateur.
        const winnerRestaurants = await getRestaurantsByIds(
          supabase,
          winners.map((winner) => winner.restaurant_id)
        )
        const names = new Map(
          winnerRestaurants.map((restaurant) => [restaurant.id, restaurant.name])
        )
        const now = new Date()

        return {
          suggestions: suggestions.map((row) => ({
            restaurant: toRestaurantOutput(row.restaurant, now),
            reason: row.reason,
            source: row.source,
          })),
          recentWinners: winners.flatMap((winner) => {
            const name = names.get(winner.restaurant_id)
            return name ? [{ id: winner.restaurant_id, name, lastWonAt: winner.last_won_at }] : []
          }),
        }
      })
  )

  server.registerTool(
    'get_public_results',
    {
      title: 'Get public session results',
      description:
        'Read the public ranking of a closed session from its public results code or link ' +
        '(…/r/<code>), as shared by the host. Contains only aggregates (podium, scores, the ' +
        'confirmed decision), never who voted what. Fails with session_not_found when the code ' +
        'is unknown or the host has not made the ranking public. For a session the user took ' +
        'part in, prefer the session tools.',
      inputSchema: GetPublicResultsInputSchema,
      outputSchema: GetPublicResultsOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runSharedTool(ctx.http?.authInfo, async () => {
        const code = parseResultsParam(lastPathSegment(args.results))
        if (!code) throw new AppError('invalid_link')

        // Lecture `use cache` par le client anonyme, partagée avec la page
        // `/r/<code>` : la RPC ne rend rien d'un classement non publié.
        const results = await getPublicResults(code)
        if (!results) throw new AppError('session_not_found')

        return {
          sessionName: results.sessionName,
          closedAt: results.closedAt,
          participantCount: results.participantCount,
          podium: results.podium.map(toPublicResultRow),
          decision: results.decision ? toPublicResultRow(results.decision) : null,
          url: publicResultsUrl(code),
        }
      })
  )
}
