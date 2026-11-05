import 'server-only'

import { revalidateTag } from 'next/cache'
import { z } from 'zod'

import { ROUTE_PATTERNS, router } from '@/config/router.config'
import { getSessionConstraintConflicts } from '@/data-access/food-constraints'
import { getListByParam } from '@/data-access/lists'
import { PUBLIC_RESULTS_CACHE_PROFILE, publicResultsCacheTag } from '@/data-access/public-results'
import {
  addSessionRestaurants,
  closeSession,
  confirmDecision,
  getRunoffSession,
  getSessionByParam,
  getSessionParticipants,
  getSessionRestaurants,
  getSessionResults,
  launchSession,
  setResultsPublic,
} from '@/data-access/sessions'
import { getMyVotes } from '@/data-access/votes'
import { AppError, omkError } from '@/domain/errors'
import { CreateSessionSchema, SESSION_RESTAURANTS_MAX } from '@/domain/schemas/session'
import { SubmitVoteSchema } from '@/domain/schemas/vote'
import { parseSharedListParam } from '@/domain/share'
import { revalidateLocalizedPath } from '@/i18n/server'
import { runTool } from '@/lib/mcp/context'
import {
  CreatedSessionOutput,
  CreateSessionToolInput,
  listParamFromInput,
  nextStepAfterCreate,
  publicLink,
  ResultsOutput,
  SessionDetailsOutput,
  sessionParamFromInput,
  sessionRefSchema,
  SessionSummaryOutput,
  toResults,
  toSessionDetails,
  toSessionSummary,
  VoteToolInput,
} from '@/lib/mcp/tools/session-output'
import { absoluteUrl } from '@/lib/site'
import { createSessionUseCase } from '@/use-cases/create-session'
import { joinSessionUseCase } from '@/use-cases/join-session'
import { startSessionFromListUseCase } from '@/use-cases/start-session-from-list'
import { submitVoteUseCase } from '@/use-cases/submit-vote'

import type { Session } from '@/data-access/models'
import type { Database } from '@/data-access/models/database'
import type { McpServer } from '@modelcontextprotocol/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tools MCP des sessions de vote : créer, rejoindre, lire, voter, piloter
 * (host) et lire le classement.
 *
 * Chaque tool rejoue la Server Action équivalente (`actions/sessions.ts`,
 * `actions/votes.ts`) avec le client de l'appelant : la base revérifie rôle,
 * statut et quotas, comme pour un clic dans l'app. Seules différences : pas
 * de `redirect` — on rend les URL —, et jamais `updateTag`, qui lève dans un
 * route handler.
 */

type Client = SupabaseClient<Database>

/**
 * Session désignée par l'agent : code, ancien uuid, ou lien collé. Sous RLS,
 * une session qu'on ne voit pas et une session qui n'existe pas se
 * confondent — le même refus, qui invite à `join_session`.
 */
async function resolveSession(supabase: Client, ref: string): Promise<Session> {
  const session = await getSessionByParam(supabase, sessionParamFromInput(ref))
  if (!session) throw omkError('session_not_found')
  return session
}

/**
 * Listes de l'utilisateur, désignées par code, uuid ou lien, ramenées à leurs
 * ids. On exige qu'il en soit le propriétaire : la liste de quelqu'un d'autre
 * passe par `start_session_from_list`, qui lit le partage et non la table.
 */
async function resolveOwnListIds(
  supabase: Client,
  userId: string,
  refs: readonly string[]
): Promise<string[]> {
  const lists = await Promise.all(
    refs.map((ref) => getListByParam(supabase, listParamFromInput(ref)))
  )
  return lists.map((list) => {
    if (!list || list.owner_id !== userId) throw new AppError('list_not_found')
    return list.id
  })
}

/** Nombre de restaurants d'une session, sans rapatrier les lignes. */
async function countSessionRestaurants(supabase: Client, sessionId: string): Promise<number> {
  const { count, error } = await supabase
    .from('session_restaurants')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  if (error) throw error
  return count ?? 0
}

async function createdSession(supabase: Client, session: Session) {
  return {
    ...toSessionSummary(session),
    restaurant_count: await countSessionRestaurants(supabase, session.id),
    next_step: nextStepAfterCreate(session),
  }
}

const sessionOnly = z.object({ session: sessionRefSchema })

export function registerSessionTools(server: McpServer): void {
  server.registerTool(
    'create_session',
    {
      title: 'Create a voting session',
      description:
        'Create a new group vote ("session") on a set of restaurants, hosted by the user. Provide restaurantIds (uuids from search_restaurants) and/or lists (the user\'s own lists). Optional rules: favourite/veto quotas, closing threshold, deadline, open or duo mode. Returns the invite code and links: share invite_url with the group. Unless open or duo, the session starts in "waiting" and nobody can vote until the host calls launch_session.',
      inputSchema: CreateSessionToolInput,
      outputSchema: CreatedSessionOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, async ({ caller, supabase }) => {
        const listIds = await resolveOwnListIds(supabase, caller.userId, args.lists ?? [])

        // Le schéma du formulaire porte les règles croisées (rien de choisi,
        // ouverte sans échéance, duo et ouverte) avec les codes que la base
        // emploierait : on le rejoue sur des valeurs déjà typées, où ses
        // `coerce` sont neutres.
        const parsed = CreateSessionSchema.safeParse({
          name: args.name,
          listIds,
          restaurantIds: args.restaurantIds ?? [],
          groupIds: [],
          closesInMinutes: args.closesInMinutes,
          superlikes: args.superlikes,
          vetos: args.vetos,
          closeAtRatio: args.closeAtRatio,
          open: args.open,
          duo: args.duo,
          excludeRecentWinners: args.excludeRecentWinners,
        })
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid_form')

        const session = await createSessionUseCase(supabase, parsed.data)
        revalidateLocalizedPath(router.home())
        return createdSession(supabase, session)
      })
  )

  server.registerTool(
    'start_session_from_list',
    {
      title: 'Start a session from a list',
      description:
        'Create a voting session containing every restaurant of a list, named after the list. Works with the user\'s own list or a list someone shared (10-character share code or a /l/… or /lists/… link). The user becomes host. The session starts in "waiting": share invite_url, then the host must call launch_session.',
      inputSchema: z.object({
        list: z
          .string()
          .trim()
          .min(1)
          .max(500)
          .describe('The list: 10-character share code (e.g. "7K3M9P2QWX") or a pasted list link.'),
      }),
      outputSchema: CreatedSessionOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ list }, ctx) =>
      runTool(ctx.http?.authInfo, async ({ supabase }) => {
        const identifier = parseSharedListParam(listParamFromInput(list))
        if (identifier.kind === 'invalid') throw new AppError('list_not_found')

        const session = await startSessionFromListUseCase(supabase, identifier.value)
        revalidateLocalizedPath(router.home())
        return createdSession(supabase, session)
      })
  )

  server.registerTool(
    'get_session',
    {
      title: 'Get a session',
      description:
        "Read a session the user takes part in: status (waiting, voting, closed), rules, deadline, whether the user is host, participants (nickname only, and whether they finished voting), the restaurants with their session_restaurant_id (needed by vote) and restaurant_id (needed by confirm_decision), the user's own votes, remaining favourites/vetoes, and how many participants cannot eat at each restaurant (dietary constraints, counts only). Call it before voting or managing a session.",
      inputSchema: sessionOnly,
      outputSchema: SessionDetailsOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ session: ref }, ctx) =>
      runTool(ctx.http?.authInfo, async ({ caller, supabase }) => {
        const session = await resolveSession(supabase, ref)
        const [participants, restaurants, votes, conflicts, runoff] = await Promise.all([
          getSessionParticipants(supabase, session.id),
          getSessionRestaurants(supabase, session.id),
          getMyVotes(supabase, session.id),
          // Comme la salle : sans les conflits, la session reste lisible.
          getSessionConstraintConflicts(supabase, session.id).catch(() => []),
          getRunoffSession(supabase, session.id),
        ])
        if (!participants.some((participant) => participant.profile_id === caller.userId)) {
          throw omkError('not_participant')
        }
        return toSessionDetails({
          session,
          userId: caller.userId,
          participants,
          restaurants,
          votes,
          conflicts,
          runoff,
        })
      })
  )

  server.registerTool(
    'join_session',
    {
      title: 'Join a session',
      description:
        'Join a session as a participant, from its 6-character invite code or a pasted invite link (/join/…). Joining an already joined session is harmless. Failed attempts are rate-limited: only use codes the user gave you. Then call get_session.',
      inputSchema: z.object({
        invite: z
          .string()
          .trim()
          .min(1)
          .max(500)
          .describe('Invite code (e.g. "7K3M9P") or invite link.'),
      }),
      outputSchema: SessionSummaryOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ invite }, ctx) =>
      runTool(ctx.http?.authInfo, async ({ supabase }) => {
        const session = await joinSessionUseCase(supabase, invite)
        revalidateLocalizedPath(router.home())
        return toSessionSummary(session)
      })
  )

  server.registerTool(
    'add_restaurants_to_session',
    {
      title: 'Add restaurants to a session',
      description:
        'Add restaurants (uuids, e.g. from search_restaurants) to a session that is still in "waiting" status. Any participant may add. Not possible once voting has started. Restaurants already in the session are skipped: added_count is the number actually added, restaurant_count the new total (100 max).',
      inputSchema: z.object({
        session: sessionRefSchema,
        restaurantIds: z
          .array(z.uuid())
          .min(1)
          .max(SESSION_RESTAURANTS_MAX)
          .describe('Restaurant uuids to add, in the order they should be presented.'),
      }),
      outputSchema: SessionSummaryOutput.extend({
        added_count: z.number().int(),
        restaurant_count: z.number().int(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ session: ref, restaurantIds }, ctx) =>
      runTool(ctx.http?.authInfo, async ({ supabase }) => {
        const session = await resolveSession(supabase, ref)
        // La RPC refuserait aussi, avec les mêmes codes ; dire non ici évite
        // un premier ajout réussi suivi d'un refus au milieu de la liste.
        if (session.status === 'voting') throw omkError('session_already_started')
        if (session.status === 'closed') throw omkError('session_closed')

        const ids = [...new Set(restaurantIds)]
        // La RPC ignore sans erreur un restaurant déjà présent : seul l'écart
        // de compte dit combien sont réellement entrés.
        const before = await countSessionRestaurants(supabase, session.id)
        await addSessionRestaurants(supabase, session.id, ids)
        revalidateLocalizedPath(ROUTE_PATTERNS.session, 'page')
        const after = await countSessionRestaurants(supabase, session.id)
        return {
          ...toSessionSummary(session),
          added_count: Math.max(0, after - before),
          restaurant_count: after,
        }
      })
  )

  server.registerTool(
    'vote',
    {
      title: 'Vote on a restaurant',
      description:
        'Cast the user\'s vote on ONE restaurant of a session in "voting" status. IRREVERSIBLE: a vote can never be changed. Only call this when the user explicitly told you which value to give to THIS restaurant — never infer, batch or guess votes on their behalf. Values: 2 = favourite (+2), 1 = works for me (+1), 0 = not this time (0), -2 = veto (-2); favourites and vetoes are limited (see jokers_remaining in get_session). Fails with session_not_voting if the session is waiting or closed. Returns recorded (vote saved), already_voted (a vote already existed, nothing changed), finished (the user has voted on every restaurant; with recorded false, the session closed meanwhile and the vote was not saved) and agreed (in duo mode, this vote sealed the decision).',
      inputSchema: VoteToolInput,
      outputSchema: z.object({
        recorded: z.boolean(),
        already_voted: z.boolean(),
        finished: z.boolean(),
        agreed: z.boolean(),
        session_url: z.string(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ session: ref, sessionRestaurantId, value }, ctx) =>
      runTool(ctx.http?.authInfo, async ({ caller, supabase }) => {
        const session = await resolveSession(supabase, ref)
        // Le use case range « session pas en vote » parmi les fins normales
        // (la clôture qui tombe pendant le vote) : pour un agent qui vise une
        // session en attente ou close, c'est un refus, pas un « terminé ».
        if (session.status !== 'voting') throw omkError('session_not_voting')
        const input = SubmitVoteSchema.parse({
          sessionId: session.id,
          sessionRestaurantId,
          value,
        })
        // Pas de revalidation : l'action n'en fait pas, le Realtime suffit.
        const outcome = await submitVoteUseCase(supabase, caller.userId, input)
        return {
          recorded: outcome.recorded,
          already_voted: outcome.skipped,
          finished: outcome.finished,
          agreed: outcome.agreed,
          session_url: absoluteUrl(router.session(session)),
        }
      })
  )

  server.registerTool(
    'launch_session',
    {
      title: 'Launch voting',
      description:
        'Host only. Move a session from "waiting" to "voting": the restaurant set is frozen and every participant is notified. Needs at least 2 participants and 2 restaurants. Cannot be undone — ask the user to confirm first.',
      inputSchema: sessionOnly,
      outputSchema: SessionSummaryOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ session: ref }, ctx) =>
      runTool(ctx.http?.authInfo, async ({ supabase }) => {
        const target = await resolveSession(supabase, ref)
        const session = await launchSession(supabase, target.id)
        revalidateLocalizedPath(router.session(session))
        return toSessionSummary(session)
      })
  )

  server.registerTool(
    'close_session',
    {
      title: 'Close voting',
      description:
        'Host only. End the vote now, even if some participants have not finished: the ranking is computed from the votes cast so far and everyone is notified. Cannot be undone — ask the user to confirm first. Then use get_results.',
      inputSchema: sessionOnly,
      outputSchema: SessionSummaryOutput.extend({ results_url: z.string() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ session: ref }, ctx) =>
      runTool(ctx.http?.authInfo, async ({ supabase }) => {
        const target = await resolveSession(supabase, ref)
        const session = await closeSession(supabase, target.id)
        revalidateLocalizedPath(router.session(session))
        revalidateLocalizedPath(router.sessionResults(session))
        return {
          ...toSessionSummary(session),
          results_url: absoluteUrl(router.sessionResults(session)),
        }
      })
  )

  server.registerTool(
    'get_results',
    {
      title: 'Get session results',
      description:
        'Read the aggregated ranking of a closed session: rank, score, vote counts per restaurant, tie-break state and the decision confirmed by the host, if any. Individual votes are never exposed. While the session is not closed, available is false and the ranking is empty.',
      inputSchema: sessionOnly,
      outputSchema: ResultsOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ session: ref }, ctx) =>
      runTool(ctx.http?.authInfo, async ({ supabase }) => {
        const session = await resolveSession(supabase, ref)
        const rows =
          session.status === 'closed' ? await getSessionResults(supabase, session.id) : []
        return toResults(session, rows)
      })
  )

  server.registerTool(
    'confirm_decision',
    {
      title: 'Confirm where the group goes',
      description:
        'Host only, closed session. Confirm the restaurant the group is actually going to — usually the winner, but any restaurant of the session is allowed. Pass its restaurant_id (not session_restaurant_id). Participants see the decision immediately; calling again replaces it. Ask the user to confirm first.',
      inputSchema: z.object({
        session: sessionRefSchema,
        restaurantId: z
          .uuid()
          .describe('restaurant_id of the chosen restaurant, from get_results or get_session.'),
      }),
      outputSchema: SessionSummaryOutput.extend({
        decided_restaurant_id: z.string().nullable(),
        results_url: z.string(),
        public_results_url: z.string().nullable(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ session: ref, restaurantId }, ctx) =>
      runTool(ctx.http?.authInfo, async ({ supabase }) => {
        const target = await resolveSession(supabase, ref)
        const session = await confirmDecision(supabase, target.id, restaurantId)
        // Le lien public, s'il est ouvert, annonce la décision ; l'historique
        // la montre à la place du gagnant calculé.
        revalidateTag(publicResultsCacheTag(session.results_code), PUBLIC_RESULTS_CACHE_PROFILE)
        revalidateLocalizedPath(router.sessionResults(session))
        revalidateLocalizedPath(router.sessions())
        return {
          ...toSessionSummary(session),
          decided_restaurant_id: session.decided_restaurant_id,
          results_url: absoluteUrl(router.sessionResults(session)),
          public_results_url: publicLink(session),
        }
      })
  )

  server.registerTool(
    'set_results_public',
    {
      title: 'Share or unshare the ranking publicly',
      description:
        'Host only, closed session. public=true opens a public link to the podium (session name, top 3, decision; no nicknames, no individual votes) that anyone can open without an account; public=false closes it immediately. Ask the user to confirm before making results public.',
      inputSchema: z.object({
        session: sessionRefSchema,
        public: z.boolean().describe('true to open the public link, false to close it.'),
      }),
      outputSchema: z.object({
        invite_code: z.string(),
        results_public: z.boolean(),
        public_results_url: z.string().nullable(),
        results_url: z.string(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ session: ref, public: isPublic }, ctx) =>
      runTool(ctx.http?.authInfo, async ({ supabase }) => {
        const target = await resolveSession(supabase, ref)
        const session = await setResultsPublic(supabase, target.id, isPublic)
        // Purge immédiate : qui referme un partage s'attend à ce que ce soit
        // effectif tout de suite, pas dans l'heure.
        revalidateTag(publicResultsCacheTag(session.results_code), PUBLIC_RESULTS_CACHE_PROFILE)
        revalidateLocalizedPath(router.sessionResults(session))
        return {
          invite_code: session.invite_code,
          results_public: session.results_public,
          public_results_url: publicLink(session),
          results_url: absoluteUrl(router.sessionResults(session)),
        }
      })
  )
}
