import 'server-only'

import { revalidateTag } from 'next/cache'
import { z } from 'zod'

import { ROUTE_PATTERNS, router } from '@/config/router.config'
import {
  addRestaurantsToList,
  getListByParam,
  getListsByOwner,
  getSharedListPreview,
  getSharedListRestaurants,
  ownsSharedList,
  removeRestaurantFromList,
} from '@/data-access/lists'
import {
  getPublicList,
  getPublicListRestaurants,
  publicListCacheTag,
} from '@/data-access/public-lists'
import { getRestaurantsByIds } from '@/data-access/restaurants'
import { AppError } from '@/domain/errors'
import { CreateListSchema, LIST_NAME_MAX, ListNameSchema } from '@/domain/schemas/list'
import { parseSharedListParam } from '@/domain/share'
import { revalidateLocalizedPath } from '@/i18n/server'
import { runTool } from '@/lib/mcp/context'
import {
  lastPathSegment,
  parseInput,
  RestaurantOutputSchema,
  toRestaurantOutput,
} from '@/lib/mcp/tools/catalog'
import { absoluteUrl, listShareUrl } from '@/lib/site'
import { createListUseCase } from '@/use-cases/create-list'

import type { List, ListWithRestaurants } from '@/data-access/models'
import type { Database } from '@/data-access/models/database'
import type { McpServer } from '@modelcontextprotocol/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tools des listes : celles de l'utilisateur (lecture, création, contenu) et
 * celles qu'on lui a partagées par lien.
 *
 * Une liste s'adresse par son code de partage (10 caractères) ou par le lien
 * collé, jamais par son uuid : c'est ce que l'utilisateur voit et recopie.
 * L'uuid ne sort pas, pas plus que `owner_id`.
 */

/** Même plafond que la Server Action (`RestaurantIdsSchema`). */
const MAX_RESTAURANTS_PER_CALL = 100

const ListIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe('The 10-character list code (e.g. 7K3M9P2QWX) or a list link (…/lists/<code>).')

const RestaurantIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(MAX_RESTAURANTS_PER_CALL)
  .describe('Restaurant ids (uuid) from search_restaurants or suggest_restaurants.')

// ─── Sorties ──────────────────────────────────────────────────────

/** Ce qu'un agent sait d'une de ses listes : de quoi la nommer et l'ouvrir. */
const ListSummarySchema = z.object({
  code: z.string().describe('List code: pass it to the other list tools.'),
  name: z.string(),
  restaurantCount: z.number().int(),
  isPublic: z
    .boolean()
    .describe('Public lists have a page anyone can open, even without an account.'),
  isCollaborative: z
    .boolean()
    .describe('Collaborative lists let people with the link add restaurants.'),
  updatedAt: z.string(),
  url: z.string().describe("Owner's page of the list in the app."),
  shareUrl: z.string().describe('Link to share the list with other people.'),
})

type ListSummaryOutput = z.infer<typeof ListSummarySchema>

/** Ligne `lists` → résumé MCP. Liste blanche : ni `id`, ni `owner_id`, ni `share_token`. */
export function toListSummary(
  list: Pick<List, 'share_code' | 'name' | 'is_public' | 'is_collaborative' | 'updated_at'>,
  restaurantCount: number
): ListSummaryOutput {
  return {
    code: list.share_code,
    name: list.name,
    restaurantCount,
    isPublic: list.is_public,
    isCollaborative: list.is_collaborative,
    updatedAt: list.updated_at,
    url: absoluteUrl(router.list(list)),
    shareUrl: listShareUrl(list),
  }
}

const ListDetailSchema = ListSummarySchema.extend({
  restaurants: z.array(RestaurantOutputSchema).describe('In the order they were added.'),
})

const SharedListSchema = z.object({
  code: z.string(),
  name: z.string(),
  ownerPseudo: z
    .string()
    .nullable()
    .describe("Owner's nickname, null when unknown (public list or deleted account)."),
  isMine: z.boolean().describe('True when the list belongs to the user: use get_list instead.'),
  isPublic: z.boolean(),
  isCollaborative: z
    .boolean()
    .nullable()
    .describe('Whether the user can add restaurants to it; null when unknown.'),
  restaurantCount: z.number().int(),
  restaurants: z.array(RestaurantOutputSchema),
  shareUrl: z.string(),
})

// ─── Effets de bord ───────────────────────────────────────────────

/**
 * Purge la page publique d'une liste après une écriture, comme
 * `revalidatePublicList` dans `actions/lists.ts`. L'action appelle
 * `updateTag`, qui lève hors d'une Server Action ; `{ expire: 0 }` donne la
 * même expiration immédiate depuis un route handler — sans quoi une liste
 * publique montrerait encore une visite l'état d'avant.
 */
function revalidateListPages(shareCode: string): void {
  revalidateTag(publicListCacheTag(shareCode), { expire: 0 })
  revalidateLocalizedPath(ROUTE_PATTERNS.list, 'page')
}

/**
 * Une liste de l'utilisateur, par code ou lien. La RLS ne rend visibles que
 * ses propres listes ; le filtre sur le propriétaire le redit, pour qu'une
 * future policy plus large n'ouvre pas l'écriture par ce chemin.
 */
async function requireOwnList(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  raw: string
): Promise<ListWithRestaurants> {
  const list = await getListByParam(supabase, lastPathSegment(raw))
  if (!list || list.owner_id !== ownerId) throw new AppError('list_not_found')
  return list
}

/**
 * Vérifie que chaque restaurant existe avant d'écrire, et rend les ids
 * dédoublonnés. Sans ça, un id inventé par le modèle ferait échouer
 * l'insertion sur la clé étrangère avec un message technique — et, pour
 * `create_list`, après que la liste a déjà été créée : l'agent réessaierait et
 * laisserait derrière lui des listes vides en double.
 */
async function requireKnownRestaurants(
  supabase: SupabaseClient<Database>,
  ids: readonly string[]
): Promise<string[]> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return unique
  const found = await getRestaurantsByIds(supabase, unique)
  if (found.length !== unique.length) throw new AppError('invalid_request')
  return unique
}

// ─── Enregistrement ───────────────────────────────────────────────

export function registerListTools(server: McpServer): void {
  server.registerTool(
    'list_my_lists',
    {
      title: 'List my restaurant lists',
      description:
        'List the user\'s own saved restaurant lists (e.g. "Near the office", "Date night"), ' +
        'most recently updated first, with their codes and links. Use a code with get_list, ' +
        'add_restaurants_to_list or remove_restaurant_from_list.',
      inputSchema: z.object({}),
      outputSchema: z.object({ lists: z.array(ListSummarySchema) }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args, ctx) =>
      runTool(ctx.http?.authInfo, async ({ caller, supabase }) => {
        const lists = await getListsByOwner(supabase, caller.userId)
        return { lists: lists.map((list) => toListSummary(list, list.restaurant_count)) }
      })
  )

  server.registerTool(
    'get_list',
    {
      title: 'Get one of my lists',
      description:
        "Read one of the user's own lists with all its restaurants, from its code or link. " +
        'Fails with list_not_found for a list owned by someone else: use get_shared_list for ' +
        'a list someone shared with the user.',
      inputSchema: z.object({ list: ListIdentifierSchema }),
      outputSchema: ListDetailSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, async ({ caller, supabase }) => {
        const list = await requireOwnList(supabase, caller.userId, args.list)
        const now = new Date()
        return {
          ...toListSummary(list, list.restaurants.length),
          restaurants: list.restaurants.map((restaurant) => toRestaurantOutput(restaurant, now)),
        }
      })
  )

  server.registerTool(
    'create_list',
    {
      title: 'Create a list',
      description:
        'Create a new restaurant list for the user, optionally filled with restaurants right ' +
        'away. The list starts private (not public, not collaborative): only people given its ' +
        'link can see it. Fails with invalid_request, creating nothing, if a restaurant id is ' +
        'unknown. Returns its code and links.',
      inputSchema: z.object({
        name: ListNameSchema.describe(`List name (1 to ${LIST_NAME_MAX} characters).`),
        restaurantIds: RestaurantIdsSchema.min(0)
          .nullable()
          .optional()
          .describe('Restaurant ids (uuid) to put in the list from the start.'),
      }),
      outputSchema: ListSummarySchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, async ({ caller, supabase }) => {
        const input = parseInput(CreateListSchema, {
          name: args.name,
          restaurantIds: args.restaurantIds ?? [],
        })
        const restaurantIds = await requireKnownRestaurants(supabase, input.restaurantIds)
        const list = await createListUseCase(supabase, caller.userId, { ...input, restaurantIds })
        // Comme l'action, sans la redirection : l'URL est rendue à l'agent.
        revalidateLocalizedPath(router.lists())
        return toListSummary(list, restaurantIds.length)
      })
  )

  server.registerTool(
    'add_restaurants_to_list',
    {
      title: 'Add restaurants to a list',
      description:
        "Add restaurants to one of the user's own lists, by list code or link. Restaurants " +
        'already in the list are ignored. Get restaurant ids from search_restaurants first: ' +
        'an unknown id fails the whole call with invalid_request and adds nothing.',
      inputSchema: z.object({ list: ListIdentifierSchema, restaurantIds: RestaurantIdsSchema }),
      outputSchema: ListSummarySchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, async ({ caller, supabase }) => {
        const list = await requireOwnList(supabase, caller.userId, args.list)
        const restaurantIds = await requireKnownRestaurants(supabase, args.restaurantIds)
        await addRestaurantsToList(supabase, list.id, restaurantIds)
        revalidateListPages(list.share_code)

        const ids = new Set(list.restaurants.map((restaurant) => restaurant.id))
        for (const id of restaurantIds) ids.add(id)
        return toListSummary(list, ids.size)
      })
  )

  server.registerTool(
    'remove_restaurant_from_list',
    {
      title: 'Remove a restaurant from a list',
      description:
        "Remove one restaurant from one of the user's own lists, by list code or link. The " +
        'restaurant stays in the catalog; it can be added back with add_restaurants_to_list.',
      inputSchema: z.object({
        list: ListIdentifierSchema,
        restaurantId: z.uuid().describe('Id (uuid) of the restaurant to remove.'),
      }),
      outputSchema: ListSummarySchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, async ({ caller, supabase }) => {
        const list = await requireOwnList(supabase, caller.userId, args.list)
        await removeRestaurantFromList(supabase, list.id, args.restaurantId)
        revalidateListPages(list.share_code)

        const remaining = list.restaurants.filter(
          (restaurant) => restaurant.id !== args.restaurantId
        )
        return toListSummary(list, remaining.length)
      })
  )

  server.registerTool(
    'get_shared_list',
    {
      title: 'Open a shared list',
      description:
        'Read a restaurant list someone shared with the user, from its link (…/l/<code>) or ' +
        'its 10-character code: private lists shared by link and public lists both work. ' +
        "The owner's nickname is the only thing returned about them.",
      inputSchema: z.object({
        list: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe('The shared list link (…/l/<code>) or its 10-character code.'),
      }),
      outputSchema: SharedListSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, async ({ supabase }) => {
        const identifier = parseSharedListParam(lastPathSegment(args.list))
        if (identifier.kind === 'invalid') throw new AppError('invalid_link')
        const now = new Date()

        // Le partage par lien, comme la page `/l/<code>` pour qui a un pseudo :
        // la RPC tranche ce que le lien ouvre.
        const [preview, restaurants, isMine] = await Promise.all([
          getSharedListPreview(supabase, identifier.value),
          getSharedListRestaurants(supabase, identifier.value),
          ownsSharedList(supabase, identifier),
        ])
        if (preview) {
          return {
            code: preview.share_code,
            name: preview.name,
            ownerPseudo: preview.owner_pseudo || null,
            isMine,
            isPublic: preview.is_public,
            isCollaborative: preview.is_collaborative,
            restaurantCount: preview.restaurant_count,
            restaurants: restaurants.map((restaurant) => toRestaurantOutput(restaurant, now)),
            shareUrl: listShareUrl(preview),
          }
        }

        // Repli sur la vitrine publique (lecture en cache partagée avec la
        // page) : elle ne dit rien du propriétaire.
        if (identifier.kind !== 'code') throw new AppError('list_not_found')
        const [publicList, publicRestaurants] = await Promise.all([
          getPublicList(identifier.value),
          getPublicListRestaurants(identifier.value),
        ])
        if (!publicList) throw new AppError('list_not_found')
        return {
          code: publicList.share_code,
          name: publicList.name,
          ownerPseudo: null,
          isMine,
          isPublic: true,
          isCollaborative: null,
          restaurantCount: publicList.restaurant_count,
          restaurants: publicRestaurants.map((restaurant) => toRestaurantOutput(restaurant, now)),
          shareUrl: listShareUrl(publicList),
        }
      })
  )
}
