import { cache } from 'react'

import type {
  Group,
  GroupMemberWithProfile,
  GroupWithMembers,
  InvitationWithProfile,
  PendingInvitation,
} from './models'
import type { Database } from './models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Écritures (RPC transactionnelles, règles vérifiées en base) ───

/**
 * Sauvegarde les participants d'une session comme groupe récurrent.
 * Un groupe ne se crée que depuis une session vécue : impossible de
 * s'ajouter quelqu'un qu'on n'a jamais croisé.
 */
export async function createGroupFromSession(
  supabase: SupabaseClient<Database>,
  input: { name: string; sessionId: string }
): Promise<Group> {
  const { data, error } = await supabase.rpc('create_group_from_session', {
    p_name: input.name,
    p_session_id: input.sessionId,
  })
  if (error) throw error
  return data
}

/**
 * Pré-ajoute les membres d'un groupe comme invités en attente.
 * Renvoie le nombre d'invitations réellement posées : qui est déjà dans la
 * salle n'en reçoit pas une deuxième.
 */
export async function inviteGroupToSession(
  supabase: SupabaseClient<Database>,
  groupId: string,
  sessionId: string
): Promise<number> {
  const { data, error } = await supabase.rpc('invite_group_to_session', {
    p_group_id: groupId,
    p_session_id: sessionId,
  })
  if (error) throw error
  return data
}

/** Quitte un groupe. Refusée au propriétaire, qui supprime le groupe. */
export async function leaveGroup(
  supabase: SupabaseClient<Database>,
  groupId: string
): Promise<void> {
  const { error } = await supabase.rpc('leave_group', { p_group_id: groupId })
  if (error) throw error
}

export async function renameGroup(
  supabase: SupabaseClient<Database>,
  groupId: string,
  name: string
): Promise<Group> {
  const { data, error } = await supabase
    .from('groups')
    .update({ name })
    .eq('id', groupId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteGroup(
  supabase: SupabaseClient<Database>,
  groupId: string
): Promise<void> {
  const { error } = await supabase.from('groups').delete().eq('id', groupId)
  if (error) throw error
}

/** Décline une invitation reçue (ou la retire, côté host). */
export async function deleteSessionInvitation(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  profileId: string
): Promise<void> {
  const { error } = await supabase
    .from('session_invitations')
    .delete()
    .eq('session_id', sessionId)
    .eq('profile_id', profileId)
  if (error) throw error
}

// ─── Lectures (sous RLS : membres du groupe uniquement) ───────

/**
 * Groupes de la personne connectée, membres joints. La RLS ne rend visibles
 * que les groupes dont on est membre — le filtre est en base, pas ici.
 */
export const getMyGroups = cache(
  async (supabase: SupabaseClient<Database>): Promise<GroupWithMembers[]> => {
    const { data, error } = await supabase
      .from('groups')
      .select('*, group_members(*, profiles(id, pseudo))')
      .order('created_at', { ascending: false })
    if (error) throw error

    return data.map(({ group_members, ...group }) => ({
      ...group,
      members: sortByAddedAt(group_members),
    }))
  }
)

/** Invités d'une session qui n'ont pas encore ouvert la salle (vue host). */
export async function getSessionInvitations(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<InvitationWithProfile[]> {
  const { data, error } = await supabase
    .from('session_invitations')
    .select('*, profiles(id, pseudo)')
    .eq('session_id', sessionId)
    .order('invited_at', { ascending: true })
  if (error) throw error
  return data
}

/**
 * Invitations reçues et encore ouvertes. Passe par une RPC : la RLS de
 * `sessions` s'arrête aux participants, et un invité n'en est pas un tant
 * qu'il n'a pas ouvert la session.
 */
export const getMyPendingInvitations = cache(
  async (supabase: SupabaseClient<Database>): Promise<PendingInvitation[]> => {
    const { data, error } = await supabase.rpc('my_session_invitations')
    if (error) throw error
    return data
  }
)

function sortByAddedAt(members: GroupMemberWithProfile[]): GroupMemberWithProfile[] {
  return [...members].sort((a, b) => a.added_at.localeCompare(b.added_at))
}
