'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { sanitizeNextPath } from '@/lib/routing'
import { LinkEmailSchema, LoginSchema, SetPasswordSchema } from '@/lib/schemas/auth'
import { absoluteUrl } from '@/lib/site'

import type { FormState } from './types'

/**
 * Étape 1 du compte optionnel : rattacher un email à l'utilisateur anonyme.
 * Supabase envoie un email de confirmation ; tant qu'il n'est pas validé,
 * l'utilisateur reste anonyme et ne peut pas définir de mot de passe.
 */
export async function linkEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = LinkEmailSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Email invalide' }
  }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { error: 'Tu dois d’abord choisir un pseudo.' }

  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    {
      emailRedirectTo: absoluteUrl(
        `${router.authConfirm()}?next=${encodeURIComponent(router.account())}`
      ),
    }
  )
  if (error) {
    return {
      error: humanizeAuthError(error.message, 'Impossible d’envoyer l’email de confirmation.'),
    }
  }

  revalidatePath(router.account())
  return {
    success: `Un email de confirmation a été envoyé à ${parsed.data.email}. Ouvre le lien pour valider.`,
  }
}

/** Étape 2 : définir un mot de passe une fois l'email confirmé. */
export async function setPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = SetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Mot de passe invalide' }
  }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { error: 'Non authentifié' }
  if (user.is_anonymous || !user.email_confirmed_at) {
    return { error: 'Confirme d’abord ton adresse email.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { error: humanizeAuthError(error.message, 'Impossible de définir le mot de passe.') }
  }

  revalidatePath(router.account())
  return { success: 'Mot de passe enregistré. Tu peux te connecter depuis un autre appareil.' }
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide' }
  }

  const supabase = await createServerClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) {
    return { error: humanizeAuthError(error.message, 'Email ou mot de passe incorrect.') }
  }

  revalidatePath(router.home(), 'layout')
  redirect(sanitizeNextPath(parsed.data.next, router.home()))
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  revalidatePath(router.home(), 'layout')
  redirect(router.home())
}

function humanizeAuthError(message: string, fallback: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'Email ou mot de passe incorrect.'
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'Cette adresse est déjà utilisée par un autre compte.'
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Trop de tentatives. Réessaie dans quelques minutes.'
  }
  if (lower.includes('password should be')) return 'Le mot de passe est trop faible.'
  if (lower.includes('email not confirmed')) return 'Confirme d’abord ton adresse email.'
  if (lower.includes('anonymous sign-ins are disabled')) {
    return 'Les connexions anonymes sont désactivées sur ce projet.'
  }
  return fallback
}
