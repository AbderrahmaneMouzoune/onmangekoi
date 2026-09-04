'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { closeSession, deleteSession, launchSession, leaveSession } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/lib/errors'
import { CreateSessionSchema, JoinSessionSchema, SessionIdSchema } from '@/lib/schemas/session'
import { createSessionUseCase } from '@/use-cases/create-session'
import { joinSessionUseCase } from '@/use-cases/join-session'

import type { ActionResult, FormState } from './types'
import type { Session } from '@/data-access/models'

async function requireUser() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function createSessionAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = CreateSessionSchema.safeParse({
    name: formData.get('name'),
    listIds: formData.getAll('listIds'),
    restaurantIds: formData.getAll('restaurantIds'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide' }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { error: 'Tu dois d’abord choisir un pseudo.' }

  let sessionId: string
  try {
    const session = await createSessionUseCase(supabase, parsed.data)
    sessionId = session.id
  } catch (error) {
    return { error: toUserMessage(error) }
  }

  revalidatePath('/')
  redirect(`/sessions/${sessionId}`)
}

export async function joinSessionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = JoinSessionSchema.safeParse({ identifier: formData.get('identifier') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Code invalide' }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { error: 'Tu dois d’abord choisir un pseudo.' }

  let sessionId: string
  try {
    const session = await joinSessionUseCase(supabase, parsed.data.identifier)
    sessionId = session.id
  } catch (error) {
    return { error: toUserMessage(error) }
  }

  revalidatePath('/')
  redirect(`/sessions/${sessionId}`)
}

export async function launchSessionAction(sessionId: string): Promise<ActionResult<Session>> {
  const id = SessionIdSchema.safeParse(sessionId)
  if (!id.success) return { ok: false, error: 'Session invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    const session = await launchSession(supabase, id.data)
    revalidatePath(`/sessions/${id.data}`)
    return { ok: true, data: session }
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }
}

export async function closeSessionAction(sessionId: string): Promise<ActionResult<Session>> {
  const id = SessionIdSchema.safeParse(sessionId)
  if (!id.success) return { ok: false, error: 'Session invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    const session = await closeSession(supabase, id.data)
    revalidatePath(`/sessions/${id.data}`)
    return { ok: true, data: session }
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }
}

export async function leaveSessionAction(sessionId: string): Promise<ActionResult> {
  const id = SessionIdSchema.safeParse(sessionId)
  if (!id.success) return { ok: false, error: 'Session invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await leaveSession(supabase, id.data, user.id)
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath('/')
  redirect('/')
}

export async function deleteSessionAction(sessionId: string): Promise<ActionResult> {
  const id = SessionIdSchema.safeParse(sessionId)
  if (!id.success) return { ok: false, error: 'Session invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await deleteSession(supabase, id.data)
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath('/')
  redirect('/')
}
