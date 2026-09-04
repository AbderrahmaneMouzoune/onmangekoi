'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { updatePseudo } from '@/data-access/profile'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/lib/errors'
import { sanitizeNextPath } from '@/lib/routing'
import { SetupProfileSchema, UpdatePseudoSchema } from '@/lib/schemas/profile'
import { setupProfileUseCase } from '@/use-cases/setup-profile'

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

  revalidatePath('/', 'layout')
  redirect(sanitizeNextPath(parsed.data.next, '/'))
}

export async function updatePseudoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = UpdatePseudoSchema.safeParse({ pseudo: formData.get('pseudo') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Pseudo invalide' }
  }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu dois d’abord choisir un pseudo.' }

  try {
    await updatePseudo(supabase, user.id, parsed.data.pseudo)
    await supabase.auth.updateUser({ data: { pseudo: parsed.data.pseudo } })
  } catch (error) {
    return { error: toUserMessage(error, 'Impossible de modifier le pseudo.') }
  }

  revalidatePath('/', 'layout')
  return { success: 'Pseudo mis à jour.' }
}
