'use server'

import { redirect } from 'next/navigation'

import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { verifyTurnstile } from '@/data-access/turnstile'
import { AppError } from '@/domain/errors'
import { SetupProfileSchema, UpdatePseudoSchema } from '@/domain/schemas/profile'
import { revalidateLocalizedPath, translateError } from '@/i18n/server'
import { sanitizeNextPath } from '@/lib/routing'
import { TURNSTILE_ERRORS, TURNSTILE_FIELD } from '@/lib/turnstile'
import { setupProfileUseCase } from '@/use-cases/setup-profile'
import { updatePseudoUseCase } from '@/use-cases/update-pseudo'

import type { FormState } from './types'

/**
 * Seul endroit de l'app qui crée un utilisateur Supabase. C'est donc ici que
 * le captcha se vérifie — avant `signInAnonymously`, sinon un script s'offre
 * autant d'identités qu'il veut et la limitation de débit du « Rejoindre »
 * ne coûte plus rien à contourner.
 */
export async function setupProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = SetupProfileSchema.safeParse({
    pseudo: formData.get('pseudo'),
    next: formData.get('next') ?? undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Pseudo invalide' }
  }

  const verdict = await verifyTurnstile(formData.get(TURNSTILE_FIELD))
  if (verdict !== 'ok')
    return { error: await translateError(new AppError(TURNSTILE_ERRORS[verdict])) }

  const supabase = await createServerClient()
  try {
    await setupProfileUseCase(supabase, parsed.data.pseudo)
  } catch (error) {
    return { error: await translateError(error, 'profileSave') }
  }

  revalidateLocalizedPath(router.home(), 'layout')
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
    return { error: await translateError(error, 'pseudoUpdate') }
  }

  revalidateLocalizedPath(router.home(), 'layout')
  return { success: 'Pseudo mis à jour.' }
}
