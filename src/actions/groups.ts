'use server'

import { getTranslations } from 'next-intl/server'

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
import { CreateGroupSchema, GroupIdSchema, RenameGroupSchema } from '@/domain/schemas/group'
import { SessionIdSchema } from '@/domain/schemas/session'
import {
  errorMessage,
  revalidateLocalizedPath,
  translateError,
  translateIssue,
} from '@/i18n/server'

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
    return {
      error: await translateIssue(parsed.error.issues[0], await errorMessage('invalid_form')),
    }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { error: await errorMessage('not_authenticated') }

  let group: Group
  try {
    group = await createGroupFromSession(supabase, parsed.data)
  } catch (error) {
    return { error: await translateError(error) }
  }

  revalidateLocalizedPath(router.groups())
  revalidateLocalizedPath(router.sessionNew())
  const t = await getTranslations('groups.save')
  return { success: t('saved', { name: group.name }) }
}

/** Pré-ajoute les membres d'un groupe à une session encore en attente. */
export async function inviteGroupToSessionAction(
  groupId: string,
  sessionId: string
): Promise<ActionResult<number>> {
  const parsedGroup = GroupIdSchema.safeParse(groupId)
  const parsedSession = SessionIdSchema.safeParse(sessionId)
  if (!parsedGroup.success || !parsedSession.success) {
    return { ok: false, error: await errorMessage('invalid_request') }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  try {
    const invited = await inviteGroupToSession(supabase, parsedGroup.data, parsedSession.data)
    revalidateLocalizedPath(ROUTE_PATTERNS.session, 'page')
    return { ok: true, data: invited }
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }
}

export async function renameGroupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = RenameGroupSchema.safeParse({
    groupId: formData.get('groupId'),
    name: formData.get('name'),
  })
  if (!parsed.success) {
    return {
      error: await translateIssue(parsed.error.issues[0], await errorMessage('invalid_form')),
    }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { error: await errorMessage('not_authenticated') }

  try {
    await renameGroup(supabase, parsed.data.groupId, parsed.data.name)
  } catch (error) {
    return { error: await translateError(error) }
  }

  revalidateLocalizedPath(router.groups())
  revalidateLocalizedPath(router.account())
  const t = await getTranslations('groups.card')
  return { success: t('renamed') }
}

export async function leaveGroupAction(groupId: string): Promise<ActionResult> {
  const parsed = GroupIdSchema.safeParse(groupId)
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_group') }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  try {
    await leaveGroup(supabase, parsed.data)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidateLocalizedPath(router.groups())
  revalidateLocalizedPath(router.account())
  return { ok: true, data: undefined }
}

export async function deleteGroupAction(groupId: string): Promise<ActionResult> {
  const parsed = GroupIdSchema.safeParse(groupId)
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_group') }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  try {
    await deleteGroup(supabase, parsed.data)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidateLocalizedPath(router.groups())
  revalidateLocalizedPath(router.account())
  return { ok: true, data: undefined }
}

/** Décline une invitation reçue : elle disparaît de l'accueil. */
export async function declineInvitationAction(sessionId: string): Promise<ActionResult> {
  const parsed = SessionIdSchema.safeParse(sessionId)
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_session') }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  try {
    await deleteSessionInvitation(supabase, parsed.data, user.id)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidateLocalizedPath(router.home())
  return { ok: true, data: undefined }
}
