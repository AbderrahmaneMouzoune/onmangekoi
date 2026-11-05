import 'server-only'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { revalidateTag } from 'next/cache'
import { createTranslator } from 'next-intl'
import { z } from 'zod'

import { ROUTE_PATTERNS, router } from '@/config/router.config'
import {
  mcpAddToList,
  mcpCreateList,
  mcpCreateRestaurant,
  mcpFindRestaurants,
  mcpImportPlace,
  mcpList,
  mcpLists,
  mcpRemoveFromList,
  mcpWhoami,
  type McpList,
} from '@/data-access/mcp'
import { getPlaceDetails, isPlacesSearchEnabled, searchPlaces } from '@/data-access/places'
import { PUBLIC_LISTS_CACHE_PROFILE, publicListCacheTag } from '@/data-access/public-lists'
import { RESTAURANTS_CACHE_PROFILE, RESTAURANTS_CACHE_TAG } from '@/data-access/restaurants'
import { AppError } from '@/domain/errors'
import { PlaceIdSchema } from '@/domain/schemas/place'
import { RESTAURANT_TAGS } from '@/domain/schemas/restaurant'
import { env } from '@/env'
import { describeError } from '@/i18n/errors'
import { MESSAGES } from '@/i18n/messages'
import { revalidateLocalizedPath } from '@/i18n/server'
import { rememberRestaurantUseCase } from '@/use-cases/remember-restaurant'

import type { Locale } from '@/i18n/config'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

/**
 * Serveur MCP d'onmangekoi : ce qu'une IA peut faire des listes de quelqu'un.
 *
 * Un serveur par requête, sans état : le transport HTTP est « stateless », et
 * le jeton — qui dit au nom de qui on agit — arrive avec chaque requête. Il
 * est capturé ici, jamais exposé à l'IA comme paramètre d'outil.
 *
 * Les descriptions d'outils sont en anglais : c'est la langue que les modèles
 * lisent le mieux, et elles demandent de répondre dans la langue de la
 * personne. Les erreurs, elles, sont traduites dans sa langue, comme dans
 * l'app.
 */

const SERVER_INSTRUCTIONS = `onmangekoi keeps the user's lists of restaurants they like, to share with friends and to vote on where to eat together.

Typical request: "I ate at La Ba, it was great" / "j'ai mangé à La Ba, c'était bon".
→ Call remember_restaurant with the name (and the city if the user said it). It searches the app's catalog, falls back to Google if needed, and files the restaurant in the right list without duplicates.
  - status "added" or "already_in_list": done. Tell the user in one short sentence and give the list URL.
  - status "ambiguous": show the candidates briefly and ask which one. Then call add_to_list with the chosen catalog restaurant id, or add_restaurant with the chosen google_place_id first.
  - status "choose_list": ask which list (or offer to create one), then call remember_restaurant again with list_id or list_name.
  - status "not_found": ask for the city or a detail, or offer to add it by hand with add_restaurant.

Rules:
- Never create a restaurant without checking find_restaurant first: the catalog is shared by everyone, duplicates hurt.
- Never invent ids: use ids returned by the tools.
- Answer in the user's language, briefly. Share links (list_url) are meant to be sent to friends.`

/** Une réponse d'outil : du JSON lisible par le modèle, et la même chose structurée. */
function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: (data && typeof data === 'object' && !Array.isArray(data)
      ? data
      : { result: data }) as Record<string, unknown>,
  }
}

export interface McpContext {
  token: string
  locale: Locale
}

/** URL absolue d'une liste : celle qu'on envoie à ses amis. */
function listUrl(list: { share_code: string }): string {
  return new URL(router.sharedList(list), env.SITE_URL).toString()
}

function withUrl<T extends McpList>(list: T): T & { list_url: string } {
  return { ...list, list_url: listUrl(list) }
}

export function createMcpServer({ token, locale }: McpContext): McpServer {
  const server = new McpServer(
    { name: 'onmangekoi', title: 'On mange koi ?', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  )

  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'errors' })
  const placesEnabled = isPlacesSearchEnabled()

  /** Exécute un outil ; une erreur devient un message dans la langue de la personne. */
  async function run(action: () => Promise<unknown>): Promise<CallToolResult> {
    try {
      return ok(await action())
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: describeError(t as never, error) }],
      }
    }
  }

  /** Le catalogue est mis en cache pour tout le monde : un ajout doit s'y voir. */
  function catalogChanged(): void {
    revalidateTag(RESTAURANTS_CACHE_TAG, RESTAURANTS_CACHE_PROFILE)
  }

  /** La page publique d'une liste est en cache partagé : un changement doit s'y voir. */
  function listChanged(list: { share_code: string }): void {
    revalidateTag(publicListCacheTag(list.share_code), PUBLIC_LISTS_CACHE_PROFILE)
    revalidateLocalizedPath(ROUTE_PATTERNS.list, 'page')
    revalidateLocalizedPath(router.lists())
  }

  async function importPlace(placeId: string) {
    const place = await getPlaceDetails(placeId, locale)
    if (!place) throw new AppError('place_gone')
    const restaurant = await mcpImportPlace(token, place)
    catalogChanged()
    return restaurant
  }

  // ─── Lecture ─────────────────────────────────────────────

  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description: 'Return the onmangekoi user this connection acts for (pseudo, number of lists).',
      annotations: { readOnlyHint: true },
    },
    () => run(() => mcpWhoami(token))
  )

  server.registerTool(
    'my_lists',
    {
      title: 'My restaurant lists',
      description:
        "List the user's restaurant lists with their id, size and shareable URL (list_url).",
      annotations: { readOnlyHint: true },
    },
    () => run(async () => ({ lists: (await mcpLists(token)).map(withUrl) }))
  )

  server.registerTool(
    'get_list',
    {
      title: 'Open a list',
      description: "Return one of the user's lists with all its restaurants.",
      inputSchema: { list_id: z.uuid().describe('List id, from my_lists') },
      annotations: { readOnlyHint: true },
    },
    ({ list_id }) => run(async () => withUrl(await mcpList(token, list_id)))
  )

  server.registerTool(
    'find_restaurant',
    {
      title: 'Find a restaurant in the app',
      description:
        "Search the app's shared restaurant catalog by name or cuisine (fuzzy: 'la ba' finds 'La Ba' and 'La Baraka'). Each result says in which of the user's lists it already is (in_my_lists). Always call this before add_restaurant.",
      inputSchema: {
        query: z.string().trim().min(2).max(100).describe('Restaurant name, or a cuisine'),
        city: z.string().trim().max(80).optional().describe('City, to break ties'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ query, city }) =>
      run(async () => ({ restaurants: await mcpFindRestaurants(token, { query, city }) }))
  )

  if (placesEnabled) {
    server.registerTool(
      'search_google_places',
      {
        title: 'Search Google for a restaurant',
        description:
          'Search Google Places for restaurants not yet in the app. Returns google_place_id values to pass to add_restaurant.',
        inputSchema: {
          query: z
            .string()
            .trim()
            .min(2)
            .max(120)
            .describe('Name, ideally with the city: "La Ba Paris"'),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      ({ query }) =>
        run(async () => {
          const page = await searchPlaces({ locale, query })
          return {
            places: page.places.slice(0, 10).map((place) => ({
              google_place_id: place.placeId,
              name: place.name,
              address: place.address,
              city: place.city,
              cuisine_type: place.cuisineType,
              rating: place.rating,
            })),
          }
        })
    )
  }

  // ─── Écriture ────────────────────────────────────────────

  server.registerTool(
    'remember_restaurant',
    {
      title: 'Remember a restaurant I liked',
      description:
        'One-shot: "I ate at X, it was good". Finds X in the catalog (or on Google), adds it to the app if missing, and files it in a list without duplicates. Returns a status: added | already_in_list | ambiguous (candidates to choose from) | choose_list (several lists, ask which) | not_found.',
      inputSchema: {
        name: z.string().trim().min(2).max(100).describe('Restaurant name as the user said it'),
        city: z.string().trim().max(80).optional().describe('City, if known'),
        list_id: z.uuid().optional().describe('Target list id, if the user chose one'),
        list_name: z
          .string()
          .trim()
          .min(1)
          .max(60)
          .optional()
          .describe('Target list by name; created if it does not exist'),
      },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: placesEnabled },
    },
    (input) =>
      run(async () => {
        const result = await rememberRestaurantUseCase(
          {
            findRestaurants: (query) => mcpFindRestaurants(token, query),
            searchPlaces: placesEnabled
              ? async (query) => (await searchPlaces({ locale, query })).places
              : undefined,
            importPlace,
            lists: () => mcpLists(token),
            createList: (name) => mcpCreateList(token, name),
            addToList: (listId, restaurantId) => mcpAddToList(token, listId, restaurantId),
          },
          {
            name: input.name,
            city: input.city,
            listId: input.list_id,
            listName: input.list_name,
            defaultListName: MESSAGES[locale].lists.ai.defaultListName,
          }
        )
        if (result.status === 'added') listChanged(result.list)
        if (result.status === 'choose_list') return { ...result, lists: result.lists.map(withUrl) }
        if (result.status === 'added' || result.status === 'already_in_list') {
          return { ...result, list: withUrl(result.list) }
        }
        return result
      })
  )

  server.registerTool(
    'add_restaurant',
    {
      title: 'Add a restaurant to the app',
      description:
        "Add a restaurant to the app's shared catalog: either from Google (google_place_id, preferred: address, photo, hours come with it) or by hand (name + city at least). Only after find_restaurant found nothing. Does not file it in a list: call add_to_list next.",
      inputSchema: {
        google_place_id: PlaceIdSchema.optional().describe('From search_google_places'),
        name: z.string().trim().min(2).max(100).optional().describe('Manual: restaurant name'),
        city: z.string().trim().max(80).optional(),
        address: z.string().trim().max(200).optional(),
        cuisine_type: z.string().trim().max(40).optional().describe('e.g. "Vietnamese"'),
        price_level: z.number().int().min(1).max(4).optional().describe('1 (€) to 4 (€€€€)'),
        tags: z.array(z.enum(RESTAURANT_TAGS)).max(RESTAURANT_TAGS.length).optional(),
      },
      annotations: { destructiveHint: false, openWorldHint: placesEnabled },
    },
    (input) =>
      run(async () => {
        if (input.google_place_id) {
          if (!placesEnabled) throw new AppError('places_not_configured')
          return { restaurant: await importPlace(input.google_place_id) }
        }
        if (!input.name) throw new AppError('invalid_restaurant_name')
        const restaurant = await mcpCreateRestaurant(token, {
          name: input.name,
          city: input.city,
          address: input.address,
          cuisineType: input.cuisine_type,
          priceLevel: input.price_level,
          tags: input.tags,
        })
        catalogChanged()
        return { restaurant }
      })
  )

  server.registerTool(
    'create_list',
    {
      title: 'Create a list',
      description: 'Create a new restaurant list for the user ("Brunchs", "Near the office"…).',
      inputSchema: { name: z.string().trim().min(1).max(60) },
      annotations: { destructiveHint: false },
    },
    ({ name }) => run(async () => withUrl(await mcpCreateList(token, name)))
  )

  server.registerTool(
    'add_to_list',
    {
      title: 'Add a restaurant to a list',
      description: "File a catalog restaurant in one of the user's lists. Idempotent.",
      inputSchema: {
        list_id: z.uuid(),
        restaurant_id: z.uuid().describe('Catalog id, from find_restaurant or add_restaurant'),
      },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ list_id, restaurant_id }) =>
      run(async () => {
        const result = await mcpAddToList(token, list_id, restaurant_id)
        if (result.added) listChanged(result.list)
        return { ...result, list: withUrl(result.list) }
      })
  )

  server.registerTool(
    'remove_from_list',
    {
      title: 'Remove a restaurant from a list',
      description:
        "Take a restaurant out of one of the user's lists (the restaurant stays in the app).",
      inputSchema: { list_id: z.uuid(), restaurant_id: z.uuid() },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    ({ list_id, restaurant_id }) =>
      run(async () => {
        const result = await mcpRemoveFromList(token, list_id, restaurant_id)
        if (result.removed) listChanged(result.list)
        return { ...result, list: withUrl(result.list) }
      })
  )

  // ─── Prompts ─────────────────────────────────────────────
  // Raccourcis proposés par les clients MCP (« / » dans Claude).

  server.registerPrompt(
    'jai-mange',
    {
      title: "J'ai mangé à…",
      description: 'Note un resto que tu as aimé et range-le dans tes listes.',
      argsSchema: {
        restaurant: z.string().describe('Le resto, et la ville si tu veux'),
        avis: z.string().optional().describe('Ce que tu en as pensé'),
      },
    },
    ({ restaurant, avis }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `J'ai mangé à ${restaurant}${avis ? ` : ${avis}` : ''}. Ajoute-le à mes listes onmangekoi s'il n'y est pas déjà.`,
          },
        },
      ],
    })
  )

  server.registerPrompt(
    'partager-une-liste',
    {
      title: 'Partager une liste',
      description: 'Prépare un message pour partager une de tes listes de restos.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: "Montre-moi mes listes onmangekoi, puis rédige un court message pour partager celle que je choisis, avec son lien et les restos qu'elle contient.",
          },
        },
      ],
    })
  )

  return server
}
