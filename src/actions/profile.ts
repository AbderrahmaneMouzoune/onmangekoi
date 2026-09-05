'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/domain/errors'
import { SetupProfileSchema, UpdatePseudoSchema } from '@/domain/schemas/profile'
import { sanitizeNextPath } from '@/lib/routing'
import { setupProfileUseCase } from '@/use-cases/setup-profile'
import { updatePseudoUseCase } from '@/use-cases/update-pseudo'

import type { FormState } from './types'

export async function setupProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = SetupProfileSchema.safeParse({
    pseudo: formData.get('pseudo'),
    next: formData.get('next') ?? undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Pseudo invalide' }
  }

  const supabase = await createServerClient()
  try {
    await setupProfileUseCase(supabase, parsed.data.pseudo)
  } catch (error) {
    return { error: toUserMessage(error, 'Impossible d’enregistrer le pseudo. Réessaie.') }
  }

  revalidatePath(router.home(), 'layout')
  redirect(sanitizeNextPath(parsed.data.next, router.home()))
}

export async function updatePseudoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = UpdatePseudoSchema.safeParse({ pseudo: formData.get('pseudo') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Pseudo invalide' }
  }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { error: 'Tu dois d’abord choisir un pseudo.' }

  try {
    await updatePseudoUseCase(supabase, user.id, parsed.data.pseudo)
  } catch (error) {
    return { error: toUserMessage(error, 'Impossible de modifier le pseudo.') }
  }

  revalidatePath(router.home(), 'layout')
  return { success: 'Pseudo mis à jour.' }
}
