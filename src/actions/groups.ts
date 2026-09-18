'use server'

import { revalidatePath } from 'next/cache'

import { ROUTE_PATTERNS, router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import {
  createGroupFromSession,
  deleteGroup,
  deleteSessionInvitation,
  inviteGroupToSession,
  leaveGroup,
  renameGroup,
} from '@/data-access/groups'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/domain/errors'
import { CreateGroupSchema, GroupIdSchema, RenameGroupSchema } from '@/domain/schemas/group'
import { SessionIdSchema } from '@/domain/schemas/session'

import type { ActionResult, FormState } from './types'
import type { Group } from '@/data-access/models'

async function requireUser() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  return { supabase, user }
}

/** « Sauvegarder ce groupe » depuis le classement d'une session. */
export async function createGroupFromSessionAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = CreateGroupSchema.safeParse({
    name: formData.get('name'),
    sessionId: formData.get('sessionId'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide' }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { error: 'Tu dois d’abord choisir un pseudo.' }

  let group: Group
  try {
    group = await createGroupFromSession(supabase, parsed.data)
  } catch (error) {
    return { error: toUserMessage(error) }
  }

  revalidatePath(router.groups())
  revalidatePath(router.sessionNew())
  return { success: `« ${group.name} » est sauvegardé.` }
}

/** Pré-ajoute les membres d'un groupe à une session encore en attente. */
export async function inviteGroupToSessionAction(
  groupId: string,
  sessionId: string
): Promise<ActionResult<number>> {
  const parsedGroup = GroupIdSchema.safeParse(groupId)
  const parsedSession = SessionIdSchema.safeParse(sessionId)
  if (!parsedGroup.success || !parsedSession.success) {
    return { ok: false, error: 'Requête invalide' }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    const invited = await inviteGroupToSession(supabase, parsedGroup.data, parsedSession.data)
    revalidatePath(ROUTE_PATTERNS.session, 'page')
    return { ok: true, data: invited }
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }
}

export async function renameGroupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = RenameGroupSchema.safeParse({
    groupId: formData.get('groupId'),
    name: formData.get('name'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Nom invalide' }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { error: 'Non authentifié' }

  try {
    await renameGroup(supabase, parsed.data.groupId, parsed.data.name)
  } catch (error) {
    return { error: toUserMessage(error) }
  }

  revalidatePath(router.groups())
  revalidatePath(router.account())
  return { success: 'Groupe renommé.' }
}

export async function leaveGroupAction(groupId: string): Promise<ActionResult> {
  const parsed = GroupIdSchema.safeParse(groupId)
  if (!parsed.success) return { ok: false, error: 'Groupe invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await leaveGroup(supabase, parsed.data)
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath(router.groups())
  revalidatePath(router.account())
  return { ok: true, data: undefined }
}

export async function deleteGroupAction(groupId: string): Promise<ActionResult> {
  const parsed = GroupIdSchema.safeParse(groupId)
  if (!parsed.success) return { ok: false, error: 'Groupe invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await deleteGroup(supabase, parsed.data)
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath(router.groups())
  revalidatePath(router.account())
  return { ok: true, data: undefined }
}

/** Décline une invitation reçue : elle disparaît de l'accueil. */
export async function declineInvitationAction(sessionId: string): Promise<ActionResult> {
  const parsed = SessionIdSchema.safeParse(sessionId)
  if (!parsed.success) return { ok: false, error: 'Session invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await deleteSessionInvitation(supabase, parsed.data, user.id)
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath(router.home())
  return { ok: true, data: undefined }
}
