import 'server-only'

import { z } from 'zod'

import { router } from '@/config/router.config'
import { SESSION_NAME_MAX, SESSION_RESTAURANTS_MAX } from '@/domain/schemas/session'
import { DEADLINE_MAX_MINUTES, DEADLINE_MIN_MINUTES } from '@/domain/session-deadline'
import {
  CLOSE_AT_RATIO_MIN,
  JOKERS_MAX,
  jokerQuotas,
  parseSessionRules,
} from '@/domain/session-rules'
import { VOTE_VALUES } from '@/domain/vote'
import { absoluteUrl, inviteUrl, publicResultsUrl } from '@/lib/site'

import type {
  ParticipantWithProfile,
  Session,
  SessionRestaurantWithRestaurant,
  SessionResultRow,
  Vote,
} from '@/data-access/models'

/**
 * Partie pure des tools de session : lecture des identifiants que colle un
 * agent, schémas d'entrée et de sortie, et mise en forme minimale des lignes
 * de la base.
 *
 * La règle tient en une phrase : rien ne sort qui ne serve à l'agent. Ni
 * `host_id`, ni `invite_token`, ni `results_code` (seul le lien public, quand
 * le host l'a ouvert), ni l'uuid d'un co-participant — son pseudo suffit à
 * parler de lui, et la réponse part vers un LLM tiers.
 */

// ─── Identifiants ───────────────────────────────────────────────

/**
 * Dernier segment utile d'un lien collé : celui qui suit l'un des préfixes
 * donnés (`/sessions/7K3M9P/results` → `7K3M9P`), à défaut le dernier. Une
 * saisie qui n'a rien d'un lien revient telle quelle — les parseurs du
 * domaine (`parseSessionParam`, `parseSharedListParam`) font le reste.
 */
export function segmentFromInput(raw: string, prefixes: readonly string[]): string {
  const value = raw.trim()
  if (!/^https?:\/\//i.test(value) && !value.includes('/')) return value

  let segments: string[]
  try {
    segments = new URL(value, 'http://placeholder.local').pathname.split('/').filter(Boolean)
  } catch {
    return value
  }

  for (let index = segments.length - 2; index >= 0; index--) {
    if (prefixes.includes(segments[index])) return segments[index + 1]
  }
  return segments.at(-1) ?? value
}

/** Code de session (ou uuid d'un ancien lien) tiré d'une saisie ou d'un lien. */
export function sessionParamFromInput(raw: string): string {
  return segmentFromInput(raw, ['sessions', 'join'])
}

/** Code de liste tiré d'une saisie ou d'un lien (`/lists/…` côté propriétaire, `/l/…` partagé). */
export function listParamFromInput(raw: string): string {
  return segmentFromInput(raw, ['lists', 'l'])
}

// ─── Schémas d'entrée ───────────────────────────────────────────

/**
 * Les entrées arrivent en JSON, typées : aucun `z.coerce` ici. Le schéma du
 * formulaire (`CreateSessionSchema`) lit du FormData, où `z.coerce.boolean`
 * transformerait la chaîne `"false"` en `true` ; on n'en reprend que les
 * bornes, par ses constantes.
 */
export const sessionRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .describe(
    'The session: its 6-character invite code (e.g. "7K3M9P"), or a pasted session or invite link.'
  )

export const CreateSessionToolInput = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(SESSION_NAME_MAX)
    .describe('Session name shown to participants, e.g. "Friday lunch".'),
  restaurantIds: z
    .array(z.uuid())
    .max(SESSION_RESTAURANTS_MAX)
    .optional()
    .describe('Restaurant uuids to put to the vote (from search_restaurants or a list).'),
  lists: z
    .array(z.string().trim().min(1).max(500))
    .max(20)
    .optional()
    .describe(
      "The user's own lists whose restaurants should all be added: 10-character share code, list uuid, or list link. For someone else's shared list, use start_session_from_list."
    ),
  superlikes: z
    .number()
    .int()
    .min(0)
    .max(JOKERS_MAX)
    .optional()
    .describe('Favourite votes (+2) each participant may cast. Default 1.'),
  vetos: z
    .number()
    .int()
    .min(0)
    .max(JOKERS_MAX)
    .optional()
    .describe('Vetoes (-2) each participant may cast. Default 1.'),
  closeAtRatio: z
    .number()
    .min(CLOSE_AT_RATIO_MIN)
    .max(1)
    .optional()
    .describe(
      'Share of participants who must finish voting for the ranking to be published (0.5 to 1). Default 1 = everyone.'
    ),
  closesInMinutes: z
    .number()
    .int()
    .min(DEADLINE_MIN_MINUTES)
    .max(DEADLINE_MAX_MINUTES)
    .optional()
    .describe('Optional deadline: the vote closes automatically this many minutes from now.'),
  open: z
    .boolean()
    .optional()
    .describe(
      'Open session: no waiting room, people can join while voting is in progress. Requires closesInMinutes.'
    ),
  duo: z
    .boolean()
    .optional()
    .describe(
      'Duo mode: two people only, voting starts immediately and the first restaurant both accept wins. Cannot be combined with open.'
    ),
  excludeRecentWinners: z
    .boolean()
    .optional()
    .describe('Leave out restaurants that won one of the user’s recent sessions.'),
})

export const VoteToolInput = z.object({
  session: sessionRefSchema,
  sessionRestaurantId: z
    .uuid()
    .describe(
      'The session_restaurant_id of the restaurant, as returned by get_session (not the restaurant_id).'
    ),
  value: z
    .literal(VOTE_VALUES)
    .describe(
      '2 = favourite (+2, limited quota), 1 = works for me (+1), 0 = not this time (0), -2 = veto (-2, limited quota).'
    ),
})

// ─── Schémas de sortie ──────────────────────────────────────────

const statusSchema = z.enum(['waiting', 'voting', 'closed'])

/** Ce qu'on rend d'une session après une écriture : de quoi la retrouver et la partager. */
export const SessionSummaryOutput = z.object({
  invite_code: z.string(),
  name: z.string(),
  status: statusSchema,
  session_url: z.string(),
  invite_url: z.string(),
})

export const CreatedSessionOutput = SessionSummaryOutput.extend({
  restaurant_count: z.number().int(),
  next_step: z.string(),
})

export const SessionDetailsOutput = SessionSummaryOutput.extend({
  is_host: z.boolean(),
  rules: z.object({
    superlikes: z.number().int(),
    vetos: z.number().int(),
    close_at_ratio: z.number(),
    open: z.boolean(),
    duo: z.boolean(),
  }),
  closes_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  participant_count: z.number().int(),
  finished_count: z.number().int(),
  participants: z.array(
    z.object({
      pseudo: z.string().nullable(),
      is_me: z.boolean(),
      is_host: z.boolean(),
      finished_voting: z.boolean(),
    })
  ),
  restaurants: z.array(
    z.object({
      session_restaurant_id: z.string(),
      restaurant_id: z.string(),
      name: z.string().nullable(),
      cuisine_type: z.string().nullable(),
      city: z.string().nullable(),
      price_level: z.number().int().nullable(),
      my_vote: z.number().int().nullable(),
      participants_who_cannot_eat_here: z.number().int(),
    })
  ),
  my_progress: z.object({
    voted: z.number().int(),
    remaining: z.number().int(),
    finished: z.boolean(),
  }),
  jokers_remaining: z.object({ superlikes: z.number().int(), vetos: z.number().int() }),
  decided_restaurant_id: z.string().nullable(),
  results_url: z.string().nullable(),
  public_results_url: z.string().nullable(),
  runoff_session_url: z.string().nullable(),
})

export const ResultsOutput = z.object({
  invite_code: z.string(),
  name: z.string(),
  status: statusSchema,
  available: z.boolean(),
  ranking: z.array(
    z.object({
      rank: z.number().int(),
      score: z.number(),
      restaurant_id: z.string(),
      name: z.string(),
      cuisine_type: z.string().nullable(),
      city: z.string().nullable(),
      favourites: z.number().int(),
      likes: z.number().int(),
      dislikes: z.number().int(),
      vetoes: z.number().int(),
      votes_count: z.number().int(),
      decided: z.boolean(),
      tiebreak: z.enum(['tied', 'runoff', 'winner', 'loser']).nullable(),
    })
  ),
  decision: z.object({ restaurant_id: z.string(), name: z.string() }).nullable(),
  results_url: z.string(),
  public_results_url: z.string().nullable(),
})

export type SessionSummary = z.infer<typeof SessionSummaryOutput>
export type SessionDetails = z.infer<typeof SessionDetailsOutput>
export type Results = z.infer<typeof ResultsOutput>

// ─── Mise en forme ──────────────────────────────────────────────

/** Lien public du classement, seulement quand le host l'a ouvert sur une session close. */
export function publicLink(session: Session): string | null {
  return session.status === 'closed' && session.results_public ? publicResultsUrl(session) : null
}

export function toSessionSummary(session: Session): SessionSummary {
  return {
    invite_code: session.invite_code,
    name: session.name,
    status: session.status,
    session_url: absoluteUrl(router.session(session)),
    invite_url: inviteUrl(session),
  }
}

/**
 * La suite à donner après une création : en salle d'attente, rien ne se vote
 * tant que le host n'a pas lancé — l'agent doit le dire, sinon l'utilisateur
 * attend un vote qui ne démarrera jamais.
 */
export function nextStepAfterCreate(session: Session): string {
  if (session.status === 'waiting') {
    return 'Share invite_url with the group. Voting has not started: once everyone has joined, the host (this user) must call launch_session (at least 2 participants and 2 restaurants needed).'
  }
  return 'Voting is open: share invite_url with the group. Use get_session to see the restaurants and their session_restaurant_id.'
}

export interface SessionDetailsSource {
  session: Session
  userId: string
  participants: ParticipantWithProfile[]
  restaurants: SessionRestaurantWithRestaurant[]
  votes: Vote[]
  conflicts: { restaurant_id: string; blocked_count: number }[]
  runoff: Session | null
}

/**
 * Vue d'une session pour un agent, composée des lectures déjà faites. Les
 * jokers restants se comptent sur ses propres votes, comme dans la salle : la
 * base reste seule à décider, la sortie n'en est que le reflet.
 */
export function toSessionDetails(source: SessionDetailsSource): SessionDetails {
  const { session, userId, participants, restaurants, votes, conflicts, runoff } = source
  const rules = parseSessionRules(session.rules)

  const myVotes = new Map(votes.map((vote) => [vote.session_restaurant_id, vote.value]))
  const blocked = new Map(conflicts.map((row) => [row.restaurant_id, row.blocked_count]))
  const jokers = jokerQuotas(rules, {
    fav: votes.filter((vote) => vote.value === 2).length,
    veto: votes.filter((vote) => vote.value === -2).length,
  })

  const me = participants.find((participant) => participant.profile_id === userId)
  const voted = restaurants.filter((row) => myVotes.has(row.id)).length

  return {
    ...toSessionSummary(session),
    is_host: session.host_id === userId,
    rules: {
      superlikes: rules.superlikes,
      vetos: rules.vetos,
      close_at_ratio: rules.close_at_ratio,
      open: rules.open === true,
      duo: rules.duo === true,
    },
    closes_at: session.closes_at,
    closed_at: session.closed_at,
    participant_count: participants.length,
    finished_count: participants.filter((participant) => participant.has_finished_voting).length,
    participants: participants.map((participant) => ({
      pseudo: participant.profiles?.pseudo ?? null,
      is_me: participant.profile_id === userId,
      is_host: participant.profile_id !== null && participant.profile_id === session.host_id,
      finished_voting: participant.has_finished_voting,
    })),
    restaurants: restaurants.map((row) => ({
      session_restaurant_id: row.id,
      restaurant_id: row.restaurant_id,
      name: row.restaurants?.name ?? null,
      cuisine_type: row.restaurants?.cuisine_type ?? null,
      city: row.restaurants?.city ?? null,
      price_level: row.restaurants?.price_level ?? null,
      my_vote: myVotes.get(row.id) ?? null,
      participants_who_cannot_eat_here: blocked.get(row.restaurant_id) ?? 0,
    })),
    my_progress: {
      voted,
      remaining: Math.max(0, restaurants.length - voted),
      finished: me?.has_finished_voting ?? false,
    },
    jokers_remaining: { superlikes: jokers.fav.remaining, vetos: jokers.veto.remaining },
    decided_restaurant_id: session.decided_restaurant_id,
    results_url: session.status === 'closed' ? absoluteUrl(router.sessionResults(session)) : null,
    public_results_url: publicLink(session),
    runoff_session_url: runoff ? absoluteUrl(router.session(runoff)) : null,
  }
}

/**
 * Classement agrégé : rangs, scores et décomptes par restaurant — jamais qui
 * a voté quoi, la RPC ne le renvoie pas. Vide tant que la session n'est pas
 * close : `available` le dit à l'agent plutôt qu'un tableau muet.
 */
export function toResults(session: Session, rows: SessionResultRow[]): Results {
  const ranking = rows.map((row) => ({
    rank: row.rank,
    score: row.score,
    restaurant_id: row.restaurant_id,
    name: row.name,
    cuisine_type: row.cuisine_type,
    city: row.city,
    favourites: row.superlikes,
    likes: row.likes,
    dislikes: row.dislikes,
    vetoes: row.super_dislikes,
    votes_count: row.votes_count,
    decided: row.decided,
    tiebreak: row.tiebreak,
  }))
  const decided = ranking.find((row) => row.decided)

  return {
    invite_code: session.invite_code,
    name: session.name,
    status: session.status,
    available: session.status === 'closed' && ranking.length > 0,
    ranking,
    decision: decided ? { restaurant_id: decided.restaurant_id, name: decided.name } : null,
    results_url: absoluteUrl(router.sessionResults(session)),
    public_results_url: publicLink(session),
  }
}
