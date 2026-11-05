import 'server-only'

import { z } from 'zod'

import { router } from '@/config/router.config'
import { getMyFoodConstraints, saveMyFoodConstraints } from '@/data-access/food-constraints'
import { mcpWhoami } from '@/data-access/mcp'
import { getMySessionHistory } from '@/data-access/sessions'
import { getMyStats } from '@/data-access/stats'
import { SESSION_HISTORY_PAGE_SIZE } from '@/domain/history'
import { FoodConstraintsSchema } from '@/domain/schemas/food-constraints'
import { RESTAURANT_TAGS } from '@/domain/schemas/restaurant'
import { revalidateLocalizedPath } from '@/i18n/server'
import { runSharedTool, runTool } from '@/lib/mcp/context'
import { parseInput } from '@/lib/mcp/tools/catalog'
import { absoluteUrl } from '@/lib/site'

import type { MyStats, SessionHistoryEntry } from '@/data-access/models'
import type { FoodConstraints } from '@/domain/food-constraints'
import type { McpServer } from '@modelcontextprotocol/server'

/**
 * Tools « moi » : qui est connecté, son historique, ses statistiques et ses
 * contraintes alimentaires. Tout se lit pour `auth.uid()` — les RPC ne
 * prennent pas d'identifiant, et `caller.userId` ne sert qu'à filtrer ce que
 * la RLS limite déjà. Jamais d'email : il n'apporte rien à un agent.
 *
 * `whoami` est ouvert aux deux modes de connexion (il passe par `mcp_whoami`) :
 * c'est par lui qu'un agent branché par jeton personnel découvre qu'il lui
 * manque OAuth pour les sessions. Le reste exige OAuth.
 */

/** Plafond d'une page d'historique demandée par un agent. */
const HISTORY_LIMIT_MAX = 30

// ─── Sorties ──────────────────────────────────────────────────────

const WhoamiOutputSchema = z.object({
  mode: z
    .enum(['oauth', 'token'])
    .describe(
      '"oauth": every tool is available. "token": personal token, catalogue and lists only — ' +
        'sessions, votes, history and profile need the OAuth connection.'
    ),
  pseudo: z.string().nullable().describe('Nickname shown to other participants.'),
  listCount: z.number().int().describe('Number of restaurant lists the user owns.'),
  isAnonymous: z
    .boolean()
    .nullable()
    .describe(
      'True for a nickname-only account without email: it can be lost after 90 days of inactivity. Suggest linking an email from the account page. Null with a personal token (unknown).'
    ),
  accountUrl: z.string(),
  links: z.object({
    newSession: z.string(),
    duo: z.string(),
    sessions: z.string(),
    lists: z.string(),
  }),
})

const HistoryEntrySchema = z.object({
  code: z.string().describe('6-character session invite code: pass it to the session tools.'),
  name: z.string(),
  status: z.enum(['waiting', 'voting', 'closed']),
  isHost: z.boolean(),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  participantCount: z.number().int(),
  restaurantCount: z.number().int(),
  winner: z
    .object({
      name: z.string(),
      score: z.number().nullable(),
      decided: z
        .boolean()
        .describe('True when the host confirmed it; false when it is only the top of the ranking.'),
    })
    .nullable()
    .describe('Restaurant the session chose, once closed.'),
  url: z.string(),
  resultsUrl: z.string().nullable(),
})

type HistoryEntryOutput = z.infer<typeof HistoryEntrySchema>

/**
 * Ligne `my_sessions` → forme MCP. L'uuid de la session ne sort pas : le code
 * d'invitation l'adresse partout, et c'est lui que l'utilisateur reconnaît.
 */
export function toHistoryEntry(entry: SessionHistoryEntry): HistoryEntryOutput {
  const closed = entry.status === 'closed'
  return {
    code: entry.invite_code,
    name: entry.name,
    status: entry.status,
    isHost: entry.is_host,
    createdAt: entry.created_at,
    closedAt: entry.closed_at,
    participantCount: entry.participant_count,
    restaurantCount: entry.restaurant_count,
    winner: entry.winner_name
      ? {
          name: entry.winner_name,
          score: entry.winner_score,
          decided: entry.winner_decided === true,
        }
      : null,
    url: absoluteUrl(router.session(entry)),
    resultsUrl: closed ? absoluteUrl(router.sessionResults(entry)) : null,
  }
}

const StatsOutputSchema = z.object({
  sessionsTotal: z.number().int(),
  sessionsHosted: z.number().int(),
  sessionsClosed: z.number().int(),
  votesTotal: z.number().int(),
  favouriteVotes: z.number().int(),
  vetoVotes: z.number().int(),
  favouriteCuisine: z
    .object({ name: z.string(), votes: z.number().int() })
    .nullable()
    .describe('Cuisine the user gave the most favourite votes to.'),
  topRestaurant: z
    .object({ name: z.string(), wins: z.number().int() })
    .nullable()
    .describe("Restaurant that won the most of the user's sessions."),
})

/** Ce qu'affiche un compte sans aucune session : des zéros, rien de désigné. */
const EMPTY_STATS: MyStats = {
  sessions_total: 0,
  sessions_hosted: 0,
  sessions_closed: 0,
  votes_total: 0,
  fav_votes: 0,
  veto_votes: 0,
  favorite_cuisine: null,
  favorite_cuisine_votes: 0,
  top_restaurant_name: null,
  top_restaurant_wins: 0,
}

export function toStatsOutput(stats: MyStats | null): z.infer<typeof StatsOutputSchema> {
  const s = stats ?? EMPTY_STATS
  return {
    sessionsTotal: s.sessions_total,
    sessionsHosted: s.sessions_hosted,
    sessionsClosed: s.sessions_closed,
    votesTotal: s.votes_total,
    favouriteVotes: s.fav_votes,
    vetoVotes: s.veto_votes,
    favouriteCuisine: s.favorite_cuisine
      ? { name: s.favorite_cuisine, votes: s.favorite_cuisine_votes }
      : null,
    topRestaurant: s.top_restaurant_name
      ? { name: s.top_restaurant_name, wins: s.top_restaurant_wins }
      : null,
  }
}

const FoodConstraintsOutputSchema = z.object({
  tags: z
    .array(z.enum(RESTAURANT_TAGS))
    .describe('Diets the user needs: a restaurant must serve all of them.'),
  maxPriceLevel: z
    .number()
    .int()
    .nullable()
    .describe('Highest price level the user accepts, 1 (€) to 4 (€€€€); null means no limit.'),
  accountUrl: z.string(),
})

function toFoodConstraintsOutput(
  constraints: FoodConstraints
): z.infer<typeof FoodConstraintsOutputSchema> {
  return {
    tags: constraints.tags,
    maxPriceLevel: constraints.maxPriceLevel,
    accountUrl: absoluteUrl(router.account()),
  }
}

/**
 * Entrée de `set_food_constraints` en types JSON stricts : le schéma du
 * domaine accepte aussi les valeurs d'un formulaire (« 2 », `''`), puis
 * normalise l'ordre des régimes. Les deux champs sont exigés : l'écriture
 * remplace tout, un oubli effacerait une déclaration.
 */
const SetFoodConstraintsInputSchema = z.object({
  tags: z
    .array(z.enum(RESTAURANT_TAGS))
    .max(RESTAURANT_TAGS.length)
    .describe('Every diet the user needs. An empty array removes them all.'),
  maxPriceLevel: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullable()
    .describe('Highest price level accepted, 1 (€) to 4 (€€€€); null removes the limit.'),
})

// ─── Enregistrement ───────────────────────────────────────────────

export function registerMeTools(server: McpServer): void {
  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description:
        'Identify the onmangekoi user this connection acts for: nickname, number of lists, ' +
        'connection mode and account type, with links to the main pages of the app. Call it ' +
        'to greet the user, or to know which tools the connection allows (`mode`).',
      inputSchema: z.object({}),
      outputSchema: WhoamiOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args, ctx) =>
      runSharedTool(ctx.http?.authInfo, async ({ caller, access }) => {
        // `mcp_whoami` sert les deux modes : en OAuth, `auth.uid()` fait foi.
        const me = await mcpWhoami(access)
        return {
          mode: caller.mode,
          pseudo: me.pseudo || null,
          listCount: me.list_count,
          isAnonymous: caller.mode === 'oauth' ? caller.isAnonymous : null,
          accountUrl: absoluteUrl(router.account()),
          links: {
            newSession: absoluteUrl(router.sessionNew()),
            duo: absoluteUrl(router.duo()),
            sessions: absoluteUrl(router.sessions()),
            lists: absoluteUrl(router.lists()),
          },
        }
      })
  )

  server.registerTool(
    'my_sessions',
    {
      title: 'My session history',
      description:
        'List the sessions the user hosted or joined, newest first, with their status and the ' +
        'restaurant each closed session chose. Paginated: pass `nextCursor` back as `cursor` ' +
        'to get older sessions; null means there are no more.',
      inputSchema: z.object({
        cursor: z
          .string()
          .trim()
          .max(200)
          .nullable()
          .optional()
          .describe('`nextCursor` from the previous page. Omit for the newest sessions.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(HISTORY_LIMIT_MAX)
          .default(SESSION_HISTORY_PAGE_SIZE)
          .describe(`Sessions per page (1 to ${HISTORY_LIMIT_MAX}).`),
      }),
      outputSchema: z.object({
        sessions: z.array(HistoryEntrySchema),
        nextCursor: z.string().nullable(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, async ({ supabase }) => {
        // Un curseur illisible vaut « première page » (`parseSessionCursor`),
        // comme dans l'URL de `/sessions` : rien à refuser.
        const page = await getMySessionHistory(supabase, {
          limit: args.limit,
          cursor: args.cursor ?? null,
        })
        return { sessions: page.entries.map(toHistoryEntry), nextCursor: page.nextCursor }
      })
  )

  server.registerTool(
    'my_stats',
    {
      title: 'My stats',
      description:
        "The user's personal onmangekoi statistics: sessions joined, hosted and closed, votes " +
        'cast, favourite cuisine and the restaurant that won most often. Counts only the ' +
        "user's own votes.",
      inputSchema: z.object({}),
      outputSchema: StatsOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args, ctx) =>
      runTool(ctx.http?.authInfo, async ({ supabase }) => toStatsOutput(await getMyStats(supabase)))
  )

  server.registerTool(
    'get_food_constraints',
    {
      title: 'Get my food constraints',
      description:
        'Read what the user cannot eat: required diets and maximum budget. The app uses them to ' +
        'flag restaurants that do not fit (it never hides them). Use them to filter ' +
        'search_restaurants (`tags`, `priceMax`).',
      inputSchema: z.object({}),
      outputSchema: FoodConstraintsOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args, ctx) =>
      runTool(ctx.http?.authInfo, async ({ caller, supabase }) =>
        toFoodConstraintsOutput(await getMyFoodConstraints(supabase, caller.userId))
      )
  )

  server.registerTool(
    'set_food_constraints',
    {
      title: 'Set my food constraints',
      description:
        "Replace the user's food constraints (required diets and maximum budget) with the " +
        'given values. This overwrites what was declared: read get_food_constraints first and ' +
        'send the complete new set. Other participants of a session only ever see how many ' +
        'people a restaurant does not suit, never who.',
      inputSchema: SetFoodConstraintsInputSchema,
      outputSchema: FoodConstraintsOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, async ({ supabase }) => {
        const constraints = parseInput(FoodConstraintsSchema, args)
        await saveMyFoodConstraints(supabase, constraints)
        // Comme l'action : la page compte affiche ces contraintes.
        revalidateLocalizedPath(router.account())
        return toFoodConstraintsOutput(constraints)
      })
  )
}
