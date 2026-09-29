'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { omkError, toUserMessage } from '@/domain/errors'
import { oauthFailureFromCode } from '@/domain/oauth'
import {
  LinkEmailSchema,
  LoginSchema,
  OAuthStartSchema,
  SetPasswordSchema,
} from '@/domain/schemas/auth'
import { env } from '@/env'
import { sanitizeNextPath } from '@/lib/routing'
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

/**
 * « Continuer avec Google / Apple ». Deux intentions, une seule route de retour :
 *  - `link` (depuis « Mon compte ») : `linkIdentity` rattache l'identité à
 *    l'utilisateur courant, anonyme ou non. Il garde son `user_id` — listes,
 *    sessions et votes restent les siens, sans migration ;
 *  - `login` (depuis `/login`) : on se reconnecte au compte déjà lié.
 *
 * Le client serveur pose le `code_verifier` PKCE en cookie avant de renvoyer
 * l'URL du fournisseur ; `/auth/callback` le consomme au retour. Le
 * fournisseur doit figurer dans `NEXT_PUBLIC_AUTH_PROVIDERS` : un bouton
 * masqué ne doit pas rester appelable en forgeant le formulaire.
 */
export async function startOAuthAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = OAuthStartSchema.safeParse({
    provider: formData.get('provider'),
    intent: formData.get('intent'),
    next: formData.get('next') ?? undefined,
  })
  if (!parsed.success || !env.NEXT_PUBLIC_AUTH_PROVIDERS.includes(parsed.data.provider)) {
    return { error: toUserMessage(omkError('oauth_unavailable')) }
  }

  const { provider, intent } = parsed.data
  const fallback = intent === 'link' ? router.account() : router.home()
  const redirectTo = absoluteUrl(
    router.authCallback({ intent, next: sanitizeNextPath(parsed.data.next, fallback) })
  )

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (intent === 'link' && !user) return { error: 'Tu dois d’abord choisir un pseudo.' }

  const { data, error } =
    intent === 'link'
      ? await supabase.auth.linkIdentity({ provider, options: { redirectTo } })
      : await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })

  if (error || !data.url) {
    return { error: toUserMessage(omkError(oauthFailureFromCode(error?.code))) }
  }

  redirect(data.url)
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
