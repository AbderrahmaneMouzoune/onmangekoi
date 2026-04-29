import type { Session, SessionParticipant } from './models'
import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ParticipantWithProfile = SessionParticipant & {
  profiles: {
    id: string
    pseudo: string
  }
}

export async function createSession(
  supabase: SupabaseClient<Database>,
  data: { name: string; hostId: string }
): Promise<Session> {
  const { data: session, error } = await supabase
    .from('sessions')
    .insert({ name: data.name, host_id: data.hostId })
    .select()
    .single()
  if (error) throw error
  return session
}

export async function createSessionRestaurants(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  restaurantIds: string[]
): Promise<void> {
  const rows = restaurantIds.map((restaurantId, index) => ({
    session_id: sessionId,
    restaurant_id: restaurantId,
    position: index,
  }))
  const { error } = await supabase.from('session_restaurants').insert(rows)
  if (error) throw error
}

export async function createHostParticipant(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  profileId: string
): Promise<SessionParticipant> {
  const { data, error } = await supabase
    .from('session_participants')
    .insert({ session_id: sessionId, profile_id: profileId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getSessionByToken(
  supabase: SupabaseClient<Database>,
  token: string
): Promise<Session | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select()
    .eq('invite_token', token)
    .single()
  if (error) return null
  return data
}

export async function getSessionByCode(
  supabase: SupabaseClient<Database>,
  code: string
): Promise<Session | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select()
    .eq('invite_code', code.toUpperCase())
    .single()
  if (error) return null
  return data
}

export async function getSessionById(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<Session | null> {
  const { data, error } = await supabase.from('sessions').select().eq('id', sessionId).single()
  if (error) return null
  return data
}

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
  return data as ParticipantWithProfile[]
}

export async function upsertParticipant(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  profileId: string
): Promise<SessionParticipant> {
  const { data, error } = await supabase
    .from('session_participants')
    .upsert(
      { session_id: sessionId, profile_id: profileId },
      { onConflict: 'session_id,profile_id', ignoreDuplicates: false }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSessionStatus(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  status: 'voting' | 'closed'
): Promise<void> {
  type SessionUpdate = Database['public']['Tables']['sessions']['Update']
  const update: SessionUpdate = { status }
  if (status === 'voting') update.launched_at = new Date().toISOString()
  if (status === 'closed') update.closed_at = new Date().toISOString()
  const { error } = await supabase.from('sessions').update(update).eq('id', sessionId)
  if (error) throw error
}
