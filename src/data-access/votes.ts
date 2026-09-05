import type { Vote } from './models'
import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function submitVote(
  supabase: SupabaseClient<Database>,
  input: { sessionId: string; sessionRestaurantId: string; value: number }
): Promise<void> {
  const { error } = await supabase.rpc('submit_vote', {
    p_session_id: input.sessionId,
    p_session_restaurant_id: input.sessionRestaurantId,
    p_value: input.value,
  })
  if (error) throw error
}

/** Les votes de l'utilisateur courant (RLS : uniquement les siens). */
export async function getMyVotes(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<Vote[]> {
  const { data, error } = await supabase.from('votes').select().eq('session_id', sessionId)
  if (error) throw error
  return data
}
