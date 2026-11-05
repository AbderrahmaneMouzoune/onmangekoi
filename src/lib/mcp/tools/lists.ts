import 'server-only'

import { revalidateTag } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'

import { ROUTE_PATTERNS, router } from '@/config/router.config'
import { getSharedListPreview, getSharedListRestaurants, ownsSharedList } from '@/data-access/lists'
import {
  mcpAddToList,
  mcpCreateList,
  mcpList,
  mcpLists,
  mcpRemoveFromList,
} from '@/data-access/mcp'
import { isPlacesSearchEnabled } from '@/data-access/places'
import {
  getPublicList,
  getPublicListRestaurants,
  publicListCacheTag,
} from '@/data-access/public-lists'
import { AppError } from '@/domain/errors'
import { LIST_NAME_MAX, ListNameSchema } from '@/domain/schemas/list'
import { RESTAURANT_CITY_MAX } from '@/domain/schemas/restaurant'
import { parseListParam, parseSharedListParam } from '@/domain/share'
import { revalidateLocalizedPath } from '@/i18n/server'
import { runSharedTool, runTool } from '@/lib/mcp/context'
import {
  CatalogRestaurantOutputSchema,
  FoundRestaurantOutputSchema,
  GooglePlaceOutputSchema,
  importGooglePlace,
  lastPathSegment,
  RestaurantOutputSchema,
  searchGooglePlaces,
  toCatalogRestaurant,
  toFoundRestaurant,
  toRestaurantOutput,
} from '@/lib/mcp/tools/catalog'
import { absoluteUrl, listShareUrl } from '@/lib/site'
import {
  rememberRestaurantDeps,
  rememberRestaurantUseCase,
  type RememberRestaurantResult,
} from '@/use-cases/remember-restaurant'

import type { McpAccess, McpList } from '@/data-access/mcp'
import type { McpServer } from '@modelcontextprotocol/server'

/**
 * Tools des listes : celles de l'utilisateur (lecture, création, contenu, et
 * « j'ai mangé à… » en un appel), et celles qu'on lui a partagées par lien.
 *
 * Les listes de l'utilisateur passent par les RPC `mcp_*` : elles ne rendent
 * que ses propres listes et n'écrivent que dedans, avec un jeton personnel
 * comme en OAuth (`runSharedTool`). Une liste s'adresse par son id, son code
 * de partage (10 caractères) ou le lien collé : l'agent recopie ce qu'il a
 * sous la main. `owner_id` et `share_token` ne sortent jamais.
 *
 * Une liste partagée par quelqu'un d'autre (`get_shared_list`) se lit avec
 * les droits de l'utilisateur connecté : réservée à OAuth.
 */

const ListRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe('List id (from my_lists), its 10-character code (e.g. 7K3M9P2QWX) or its link.')

// ─── Sorties ──────────────────────────────────────────────────────

/** Ce qu'un agent sait d'une de ses listes : de quoi la nommer, l'ouvrir et la partager. */
const ListSummarySchema = z.object({
  id: z.string().describe('List id: pass it to the other list tools.'),
  code: z.string().describe('10-character list code, as shown in its links.'),
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
  shareUrl: z.string().describe('Link to send to friends.'),
})

type ListSummaryOutput = z.infer<typeof ListSummarySchema>

/** Liste rendue par une RPC `mcp_*` → résumé MCP, liens absolus compris. */
export function toListSummary(list: McpList): ListSummaryOutput {
  return {
    id: list.id,
    code: list.share_code,
    name: list.name,
    restaurantCount: list.restaurant_count,
    isPublic: list.is_public,
    isCollaborative: list.is_collaborative,
    updatedAt: list.updated_at,
    url: absoluteUrl(router.list(list)),
    shareUrl: listShareUrl(list),
  }
}

const ListDetailSchema = ListSummarySchema.extend({
  restaurants: z.array(CatalogRestaurantOutputSchema).describe('In the order they were added.'),
})

const AddToListOutputSchema = z.object({
  added: z.boolean(),
  alreadyInList: z
    .boolean()
    .describe('True when the restaurant was already there: nothing changed.'),
  list: ListSummarySchema,
  restaurant: CatalogRestaurantOutputSchema,
})

const RemoveFromListOutputSchema = z.object({
  removed: z.boolean().describe('False when the restaurant was not in the list.'),
  list: ListSummarySchema,
})

/**
 * Sortie de `remember_restaurant`. Un objet plat plutôt qu'une union : le
 * schéma de sortie d'un tool doit être un objet JSON, et `status` dit quels
 * champs sont remplis.
 */
const RememberOutputSchema = z.object({
  status: z
    .enum(['added', 'already_in_list', 'ambiguous', 'choose_list', 'not_found'])
    .describe(
      '"added" / "already_in_list": done, see `list` and `restaurant`. "ambiguous": ask the ' +
        'user which candidate. "choose_list": ask which of `lists` (or offer a new one). ' +
        '"not_found": ask for the city or a detail, or offer add_restaurant by hand.'
    ),
  restaurant: CatalogRestaurantOutputSchema.optional(),
  list: ListSummarySchema.optional(),
  restaurantSource: z
    .enum(['catalog', 'google'])
    .optional()
    .describe('"google": imported into the app just now.'),
  listCreated: z.boolean().optional(),
  catalogCandidates: z.array(FoundRestaurantOutputSchema).optional(),
  googleCandidates: z.array(GooglePlaceOutputSchema).optional(),
  lists: z.array(ListSummarySchema).optional(),
  googleSearched: z.boolean().optional(),
})

export function toRememberOutput(
  result: RememberRestaurantResult
): z.infer<typeof RememberOutputSchema> {
  switch (result.status) {
    case 'added':
    case 'already_in_list':
      return {
        status: result.status,
        restaurant: toCatalogRestaurant(result.restaurant),
        list: toListSummary(result.list),
        restaurantSource: result.restaurant_source,
        listCreated: result.list_created,
      }
    case 'ambiguous':
      return {
        status: result.status,
        catalogCandidates: result.catalog_candidates.map(toFoundRestaurant),
        googleCandidates: result.google_candidates,
      }
    case 'choose_list':
      return { status: result.status, lists: result.lists.map(toListSummary) }
    case 'not_found':
      return { status: result.status, googleSearched: result.google_searched }
  }
}

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
 * Purge les pages d'une liste après une écriture, comme `revalidatePublicList`
 * dans `actions/lists.ts`. L'action appelle `updateTag`, qui lève hors d'une
 * Server Action ; `{ expire: 0 }` donne la même expiration immédiate depuis un
 * route handler — sans quoi une liste publique montrerait encore une visite
 * l'état d'avant.
 */
function revalidateListPages(shareCode: string): void {
  revalidateTag(publicListCacheTag(shareCode), { expire: 0 })
  revalidateLocalizedPath(ROUTE_PATTERNS.list, 'page')
  revalidateLocalizedPath(router.lists())
}

/**
 * Id d'une liste de l'utilisateur à partir de ce que l'agent a recopié : un
 * id se passe tel quel (la RPC refusera une liste qui n'est pas à lui), un
 * code ou un lien se cherche parmi ses listes.
 */
export async function resolveListId(access: McpAccess, raw: string): Promise<string> {
  const identifier = parseListParam(lastPathSegment(raw))
  if (identifier.kind === 'id') return identifier.value
  if (identifier.kind === 'invalid') throw new AppError('list_not_found')
  const list = (await mcpLists(access)).find(
    (candidate) => candidate.share_code === identifier.value
  )
  if (!list) throw new AppError('list_not_found')
  return list.id
}

// ─── Enregistrement ───────────────────────────────────────────────

export function registerListTools(server: McpServer): void {
  const placesEnabled = isPlacesSearchEnabled()

  server.registerTool(
    'my_lists',
    {
      title: 'My restaurant lists',
      description:
        'List the user\'s own restaurant lists (e.g. "Near the office", "Date night"), most ' +
        'recently updated first, with their id, size and links (shareUrl is the one to send ' +
        'to friends).',
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
      runSharedTool(ctx.http?.authInfo, async ({ access }) => ({
        lists: (await mcpLists(access)).map(toListSummary),
      }))
  )

  server.registerTool(
    'get_list',
    {
      title: 'Open one of my lists',
      description:
        "Read one of the user's own lists with all its restaurants, from its id, code or link. " +
        'Fails with list_not_found for a list owned by someone else: use get_shared_list for ' +
        'a list someone shared with the user.',
      inputSchema: z.object({ list: ListRefSchema }),
      outputSchema: ListDetailSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runSharedTool(ctx.http?.authInfo, async ({ access }) => {
        const list = await mcpList(access, await resolveListId(access, args.list))
        return {
          ...toListSummary(list),
          restaurants: list.restaurants.map(toCatalogRestaurant),
        }
      })
  )

  server.registerTool(
    'create_list',
    {
      title: 'Create a list',
      description:
        'Create a new, empty restaurant list for the user ("Brunchs", "Near the office"…). It ' +
        'starts private: only people given its link can see it. Check my_lists first to avoid ' +
        'a duplicate name. Fill it with add_to_list.',
      inputSchema: z.object({
        name: ListNameSchema.describe(`List name (1 to ${LIST_NAME_MAX} characters).`),
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
      runSharedTool(ctx.http?.authInfo, async ({ access }) => {
        const list = await mcpCreateList(access, args.name)
        // Comme l'action, sans la redirection : l'URL est rendue à l'agent.
        revalidateLocalizedPath(router.lists())
        return toListSummary(list)
      })
  )

  server.registerTool(
    'add_to_list',
    {
      title: 'Add a restaurant to a list',
      description:
        "File a catalog restaurant in one of the user's own lists. A restaurant already in the " +
        'list stays as is (alreadyInList). Get the restaurant id from find_restaurant, ' +
        'search_restaurants or add_restaurant: never invent one.',
      inputSchema: z.object({
        list: ListRefSchema,
        restaurantId: z.uuid().describe('Catalog restaurant id (uuid).'),
      }),
      outputSchema: AddToListOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runSharedTool(ctx.http?.authInfo, async ({ access }) => {
        const listId = await resolveListId(access, args.list)
        const result = await mcpAddToList(access, listId, args.restaurantId)
        if (result.added) revalidateListPages(result.list.share_code)
        return {
          added: result.added,
          alreadyInList: result.already_in_list,
          list: toListSummary(result.list),
          restaurant: toCatalogRestaurant(result.restaurant),
        }
      })
  )

  server.registerTool(
    'remove_from_list',
    {
      title: 'Remove a restaurant from a list',
      description:
        "Take a restaurant out of one of the user's own lists. The restaurant stays in the " +
        'catalog; it can be added back with add_to_list.',
      inputSchema: z.object({
        list: ListRefSchema,
        restaurantId: z.uuid().describe('Id (uuid) of the restaurant to remove.'),
      }),
      outputSchema: RemoveFromListOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runSharedTool(ctx.http?.authInfo, async ({ access }) => {
        const listId = await resolveListId(access, args.list)
        const result = await mcpRemoveFromList(access, listId, args.restaurantId)
        if (result.removed) revalidateListPages(result.list.share_code)
        return { removed: result.removed, list: toListSummary(result.list) }
      })
  )

  server.registerTool(
    'remember_restaurant',
    {
      title: 'Remember a restaurant I liked',
      description:
        'One call for "I ate at X, it was good": finds X in the catalog (or on Google), adds it ' +
        'to the app if missing, and files it in a list without duplicates. When in doubt it ' +
        'changes nothing and returns what to ask: status "ambiguous" (candidates to choose ' +
        'from), "choose_list" (several lists), "not_found". Call it again with `list` or ' +
        '`listName` once the user chose; for a chosen candidate, use add_to_list (catalog id) ' +
        'or add_restaurant (googlePlaceId) then add_to_list.',
      inputSchema: z.object({
        name: z.string().trim().min(2).max(100).describe('Restaurant name as the user said it.'),
        city: z
          .string()
          .trim()
          .max(RESTAURANT_CITY_MAX)
          .nullable()
          .optional()
          .describe('City, if the user said it.'),
        list: ListRefSchema.nullable().optional().describe('Target list, once the user chose one.'),
        listName: ListNameSchema.nullable()
          .optional()
          .describe('Target list by name; created if the user has none by that name.'),
      }),
      outputSchema: RememberOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: placesEnabled,
      },
    },
    async (args, ctx) =>
      runSharedTool(ctx.http?.authInfo, async ({ access }) => {
        const t = await getTranslations('lists.ai')
        const result = await rememberRestaurantUseCase(
          rememberRestaurantDeps(
            access,
            placesEnabled
              ? {
                  searchPlaces: searchGooglePlaces,
                  importPlace: (placeId) => importGooglePlace(access, placeId),
                }
              : null
          ),
          {
            name: args.name,
            city: args.city ?? null,
            listId: args.list ? await resolveListId(access, args.list) : null,
            listName: args.listName ?? null,
            defaultListName: t('defaultListName'),
          }
        )
        // Une liste créée en chemin l'est toujours pour y ranger le resto :
        // `added` couvre aussi la page `/lists`.
        if (result.status === 'added') revalidateListPages(result.list.share_code)
        return toRememberOutput(result)
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
