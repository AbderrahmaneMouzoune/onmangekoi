'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { updateSessionStatus } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase'
import { CreateSessionSchema, JoinSessionSchema } from '@/lib/schemas/session'
import { createSessionUseCase } from '@/use-cases/create-session'
import { joinSessionUseCase } from '@/use-cases/join-session'

export type SessionActionState = { error: string } | null

export async function createSessionAction(
  _prevState: SessionActionState,
  formData: FormData
): Promise<{ error: string }> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié' }

  const parsed = CreateSessionSchema.safeParse({
    name: formData.get('name'),
    listIds: formData.getAll('listIds'),
    restaurantIds: formData.getAll('restaurantIds'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  let sessionId: string
  try {
    const { session } = await createSessionUseCase(user.id, parsed.data)
    sessionId = session.id
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erreur lors de la création' }
  }

  redirect(`/sessions/${sessionId}`)
}

export async function joinSessionAction(
  _prevState: SessionActionState,
  formData: FormData
): Promise<{ error: string }> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié' }

  const parsed = JoinSessionSchema.safeParse({ identifier: formData.get('identifier') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  let sessionId: string
  try {
    const { session } = await joinSessionUseCase(user.id, parsed.data.identifier)
    sessionId = session.id
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Session introuvable ou déjà démarrée' }
  }

  redirect(`/sessions/${sessionId}`)
}

export async function launchSessionAction(
  sessionId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, error: 'Non authentifié' }

  const { data: session } = await supabase
    .from('sessions')
    .select('host_id, status')
    .eq('id', sessionId)
    .single()

  if (!session) return { success: false, error: 'Session introuvable' }
  if (session.host_id !== user.id) return { success: false, error: 'Réservé au host' }
  if (session.status !== 'waiting') return { success: false, error: 'La session a déjà démarré' }

  try {
    await updateSessionStatus(supabase, sessionId, 'voting')
    revalidatePath(`/sessions/${sessionId}`)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur lors du lancement',
    }
  }
}
