import { cache } from 'react'

import { parseSessionParam } from '@/domain/share'

import type {
  ParticipantWithProfile,
  Session,
  SessionPreview,
  SessionRestaurant,
  SessionRestaurantWithRestaurant,
  SessionResultRow,
  SessionSummary,
} from './models'
import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Écritures (RPC transactionnelles, règles vérifiées en base) ───

export async function createSession(
  supabase: SupabaseClient<Database>,
  input: { name: string; restaurantIds: string[] }
): Promise<Session> {
  const { data, error } = await supabase.rpc('create_session', {
    p_name: input.name,
    p_restaurant_ids: input.restaurantIds,
  })
  if (error) throw error
  return data
}

export async function joinSession(
  supabase: SupabaseClient<Database>,
  identifier: string
): Promise<Session> {
  const { data, error } = await supabase.rpc('join_session', { p_identifier: identifier })
  if (error) throw error
  return data
}

export async function launchSession(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<Session> {
  const { data, error } = await supabase.rpc('launch_session', { p_session_id: sessionId })
  if (error) throw error
  return data
}

export async function closeSession(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<Session> {
  const { data, error } = await supabase.rpc('close_session', { p_session_id: sessionId })
  if (error) throw error
  return data
}

/**
 * Ajoute un restaurant à une session en attente. La RPC vérifie en base que
 * l'appelant en est participant, que le vote n'a pas démarré et pose
 * `added_by` elle-même.
 */
export async function addSessionRestaurant(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  restaurantId: string
): Promise<SessionRestaurant> {
  const { data, error } = await supabase.rpc('add_session_restaurant', {
    p_session_id: sessionId,
    p_restaurant_id: restaurantId,
  })
  if (error) throw error
  return data
}

/**
 * Ajoute plusieurs restaurants, **en séquence** : chaque insertion prend la
 * position suivante dans le deck, donc l'ordre des appels est l'ordre de
 * sélection. En parallèle, la RPC sérialiserait quand même les écritures (elle
 * verrouille la session) mais l'ordre du deck deviendrait celui du hasard.
 */
export async function addSessionRestaurants(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  restaurantIds: string[]
): Promise<void> {
  for (const restaurantId of restaurantIds) {
    await addSessionRestaurant(supabase, sessionId, restaurantId)
  }
}

/** Retire un restaurant : celui qu'on a apporté, ou n'importe lequel si on est host. */
export async function removeSessionRestaurant(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  restaurantId: string
): Promise<void> {
  const { error } = await supabase.rpc('remove_session_restaurant', {
    p_session_id: sessionId,
    p_restaurant_id: restaurantId,
  })
  if (error) throw error
}

export async function leaveSession(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  profileId: string
): Promise<void> {
  const { error } = await supabase
    .from('session_participants')
    .delete()
    .eq('session_id', sessionId)
    .eq('profile_id', profileId)
  if (error) throw error
}

export async function deleteSession(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<void> {
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId)
  if (error) throw error
}

// ─── Lectures (sous RLS : participant uniquement) ───────────────

async function findSession(
  supabase: SupabaseClient<Database>,
  column: 'id' | 'invite_code',
  value: string
): Promise<Session | null> {
  const { data, error } = await supabase.from('sessions').select().eq(column, value).maybeSingle()
  if (error) throw error
  return data
}

/** Session par id — mémoïsée par requête : page et `generateMetadata` partagent l'appel. */
export const getSessionById = cache(
  async (supabase: SupabaseClient<Database>, sessionId: string): Promise<Session | null> =>
    findSession(supabase, 'id', sessionId)
)

/** Session par code d'invitation (le code lisible qui identifie l'URL). */
export const getSessionByCode = cache(
  async (supabase: SupabaseClient<Database>, inviteCode: string): Promise<Session | null> =>
    findSession(supabase, 'invite_code', inviteCode)
)

/**
 * Session visée par un paramètre d'URL : son code d'invitation aujourd'hui,
 * un uuid pour les liens d'avant. Mémoïsée par requête, comme les deux autres.
 */
export const getSessionByParam = cache(
  async (supabase: SupabaseClient<Database>, param: string): Promise<Session | null> => {
    const identifier = parseSessionParam(param)
    if (identifier.kind === 'invalid') return null
    return identifier.kind === 'id'
      ? getSessionById(supabase, identifier.value)
      : getSessionByCode(supabase, identifier.value)
  }
)

export async function getSessionParticipants(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<ParticipantWithProfile[]> {
  const { data, error } = await supabase
    .from('session_participants')
    .select('*, profiles(id, pseudo)')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  return data
}

/** Le participant courant a-t-il terminé ses votes ? (RLS : sa propre ligne) */
export async function hasFinishedVoting(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  profileId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('session_participants')
    .select('has_finished_voting')
    .eq('session_id', sessionId)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw error
  return data?.has_finished_voting ?? false
}

export async function getSessionRestaurants(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<SessionRestaurantWithRestaurant[]> {
  const { data, error } = await supabase
    .from('session_restaurants')
    .select('*, restaurants(*)')
    .eq('session_id', sessionId)
    .order('position', { ascending: true })
  if (error) throw error
  return data
}

export async function getMySessions(
  supabase: SupabaseClient<Database>,
  limit = 8
): Promise<SessionSummary[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, session_participants(count)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data.map(({ session_participants, ...session }) => ({
    ...session,
    participant_count: session_participants[0]?.count ?? 0,
  }))
}

/** Aperçu par token ou code — mémoïsé par requête (page, métadonnées, image OG). */
export const getSessionPreview = cache(
  async (
    supabase: SupabaseClient<Database>,
    identifier: string
  ): Promise<SessionPreview | null> => {
    const { data, error } = await supabase.rpc('session_preview', { p_identifier: identifier })
    if (error) throw error
    return data[0] ?? null
  }
)

export async function getSessionResults(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<SessionResultRow[]> {
  const { data, error } = await supabase.rpc('session_results', { p_session_id: sessionId })
  if (error) throw error
  return data
}
