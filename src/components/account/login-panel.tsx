import Link from 'next/link'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/components/account/login-form'
import { OAuthButtons } from '@/components/account/oauth-buttons'
import { OrSeparator } from '@/components/account/or-separator'
import { FormMessage } from '@/components/ui/form-message'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { omkError, toUserMessage } from '@/domain/errors'
import { isOAuthFailure } from '@/domain/oauth'
import { env } from '@/env'
import { sanitizeNextPath } from '@/lib/routing'

/** Fournisseurs activés au build : le texte et la silhouette en dépendent aussi. */
const PROVIDERS = env.NEXT_PUBLIC_AUTH_PROVIDERS

/**
 * Formulaire de connexion : dépend de `?next=`, de `?error=` (retour d'un
 * fournisseur OAuth en échec) et de la session en cours.
 */
export async function LoginPanel({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const [{ next: rawNext, error: rawError }, user] = await Promise.all([
    searchParams,
    getCurrentUser(),
  ])
  const next = sanitizeNextPath(rawNext, router.home())
  if (user && !user.is_anonymous) redirect(next)

  const oauthError = isOAuthFailure(rawError) ? toUserMessage(omkError(rawError)) : undefined
  const formNext = next !== router.home() ? next : undefined

  return (
    <>
      <LoginIntro />

      <FormMessage error={oauthError} />

      {PROVIDERS.length > 0 && (
        <>
          <OAuthButtons providers={PROVIDERS} intent="login" next={formNext} />
          <OrSeparator>ou avec ton email</OrSeparator>
        </>
      )}

      <LoginForm next={formNext} />

      <p className="text-center text-sm text-muted-foreground">
        Pas de compte ? Il n’en faut pas :{' '}
        <Link href={router.setup(next)} className="font-medium text-brand hover:underline">
          choisis juste un pseudo
        </Link>
        .
      </p>
    </>
  )
}

function LoginIntro() {
  return (
    <div className="flex flex-col gap-2">
      <p className="eyebrow">Compte</p>
      <h1 className="text-3xl font-extrabold">Retrouver mes listes</h1>
      <p className="text-sm text-ink-2">
        {PROVIDERS.length > 0
          ? 'Connecte-toi avec le compte lié depuis ton autre appareil : Google, Apple, ou ton email et ton mot de passe.'
          : 'Connecte-toi avec l’email et le mot de passe définis depuis ton autre appareil.'}
      </p>
    </div>
  )
}

/**
 * Rien de ce texte ne dépend des données : le titre, l'accroche et les
 * intitulés du formulaire s'affichent en clair dès le prérendu. Seuls les
 * champs — que la redirection `?next=` peut encore faire disparaître —
 * restent en attente.
 */
export function LoginPanelFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-8">
      <LoginIntro />

      {PROVIDERS.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            {PROVIDERS.map((provider) => (
              <Skeleton key={provider} className="h-12 w-full rounded-md" />
            ))}
          </div>
          <OrSeparator>ou avec ton email</OrSeparator>
        </>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-none font-medium text-ink">Email</p>
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-none font-medium text-ink">Mot de passe</p>
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
        <Skeleton className="h-12 w-full rounded-md" />
      </div>

      <Skeleton className="h-5 w-64 max-w-full self-center" />
    </div>
  )
}
