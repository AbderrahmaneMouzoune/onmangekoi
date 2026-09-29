'use server'

import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'
import { LinkEmailSchema, LoginSchema, SetPasswordSchema } from '@/domain/schemas/auth'
import {
  errorMessage,
  revalidateLocalizedPath,
  translateError,
  translateIssue,
} from '@/i18n/server'
import { sanitizeNextPath } from '@/lib/routing'
import { absoluteUrl } from '@/lib/site'

import type { FormState } from './types'
import type { ErrorCode } from '@/domain/errors'
import type { ErrorFallback } from '@/i18n/errors'

/**
 * Étape 1 du compte optionnel : rattacher un email à l'utilisateur anonyme.
 * Supabase envoie un email de confirmation ; tant qu'il n'est pas validé,
 * l'utilisateur reste anonyme et ne peut pas définir de mot de passe.
 */
export async function linkEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = LinkEmailSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return {
      error: await translateIssue(parsed.error.issues[0], await errorMessage('invalid_email')),
    }
  }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { error: await errorMessage('not_authenticated') }

  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    {
      emailRedirectTo: absoluteUrl(
        `${router.authConfirm()}?next=${encodeURIComponent(router.account())}`
      ),
    }
  )
  if (error) return { error: await humanizeAuthError(error.message, 'emailLink') }

  revalidateLocalizedPath(router.account())
  const t = await getTranslations('account.email')
  return { success: t('sent', { email: parsed.data.email }) }
}

/** Étape 2 : définir un mot de passe une fois l'email confirmé. */
export async function setPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = SetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })
  if (!parsed.success) {
    return {
      error: await translateIssue(parsed.error.issues[0], await errorMessage('invalid_form')),
    }
  }

  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return { error: await errorMessage('not_authenticated') }
  if (user.is_anonymous || !user.email_confirmed_at) {
    return { error: await errorMessage('email_not_confirmed') }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: await humanizeAuthError(error.message, 'passwordSet') }

  revalidateLocalizedPath(router.account())
  const t = await getTranslations('account.password')
  return { success: t('saved') }
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  })
  if (!parsed.success) {
    return {
      error: await translateIssue(parsed.error.issues[0], await errorMessage('invalid_form')),
    }
  }

  const supabase = await createServerClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) {
    const code = authErrorCode(error.message)
    return { error: await errorMessage(code ?? 'invalid_credentials') }
  }

  revalidateLocalizedPath(router.home(), 'layout')
  redirect(sanitizeNextPath(parsed.data.next, router.home()))
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  revalidateLocalizedPath(router.home(), 'layout')
  redirect(router.home())
}

/**
 * Supabase Auth répond en anglais, par des phrases et non des codes : on les
 * reconnaît, et on les ramène à un code métier (`errors.codes`). Ce qu'on ne
 * reconnaît pas prend le message de repli de l'action — jamais le texte brut.
 */
function authErrorCode(message: string): ErrorCode | null {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'invalid_credentials'
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'email_taken'
  }
  if (lower.includes('rate limit') || lower.includes('too many')) return 'auth_rate_limited'
  if (lower.includes('password should be')) return 'weak_password'
  if (lower.includes('email not confirmed')) return 'email_not_confirmed'
  if (lower.includes('anonymous sign-ins are disabled')) return 'anonymous_sign_ins_disabled'
  return null
}

async function humanizeAuthError(message: string, fallback: ErrorFallback): Promise<string> {
  const code = authErrorCode(message)
  return code ? errorMessage(code) : translateError(null, fallback)
}
