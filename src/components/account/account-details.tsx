import { RiCheckLine, RiMailLine, RiShieldCheckLine } from '@remixicon/react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { LinkEmailForm } from '@/components/account/link-email-form'
import { OAuthButtons } from '@/components/account/oauth-buttons'
import { OrSeparator } from '@/components/account/or-separator'
import { SetPasswordForm } from '@/components/account/set-password-form'
import { SignOutButton } from '@/components/account/sign-out-button'
import { UpdatePseudoForm } from '@/components/account/update-pseudo-form'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { FormMessage } from '@/components/ui/form-message'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getProfile } from '@/data-access/profile'
import { createServerClient } from '@/data-access/supabase/server'
import { omkError, toUserMessage } from '@/domain/errors'
import { isOAuthFailure, linkedOAuthProviders, OAUTH_PROVIDER_LABELS } from '@/domain/oauth'
import { env } from '@/env'
import { displayPseudo } from '@/lib/format'

import type { AccountAuthNotice } from '@/config/router.config'

/** Fournisseurs activés au build : la silhouette de chargement en dépend aussi. */
const PROVIDERS = env.NEXT_PUBLIC_AUTH_PROVIDERS

const AUTH_MESSAGES: Partial<Record<AccountAuthNotice, { error?: string; success?: string }>> = {
  invalid: { error: 'Ce lien de confirmation est invalide.' },
  expired: { error: 'Ce lien de confirmation a expiré. Renvoie un email depuis cette page.' },
  confirmed: { success: 'Adresse email confirmée.' },
  linked: { success: 'Compte lié : tu peux te reconnecter depuis un autre appareil.' },
  created: {
    success:
      'Aucun compte n’était encore lié à cette identité : un nouveau compte vient d’être créé. Choisis ton pseudo pour commencer.',
  },
}

/** Bandeau de retour : les échecs OAuth sont des codes `omk:`, traduits comme les autres. */
function authNotice(auth: string | undefined): { error?: string; success?: string } | undefined {
  if (!auth) return undefined
  if (isOAuthFailure(auth)) return { error: toUserMessage(omkError(auth)) }
  return AUTH_MESSAGES[auth as AccountAuthNotice]
}

const ACCOUNT_INTRO_WITH_PROVIDERS =
  'Optionnel. Lier un compte Google ou Apple — ou un email et un mot de passe — permet de se reconnecter depuis un autre appareil, avec les mêmes listes. Tout le reste fonctionne sans.'
const ACCOUNT_INTRO_EMAIL_ONLY =
  'Optionnel. Lier un email et un mot de passe permet de se reconnecter depuis un autre appareil. Tout le reste fonctionne sans.'
const ACCOUNT_INTRO = PROVIDERS.length > 0 ? ACCOUNT_INTRO_WITH_PROVIDERS : ACCOUNT_INTRO_EMAIL_ONLY

/** Tout le contenu de `/account` dépend de l'utilisateur : un seul `<Suspense>`. */
export async function AccountDetails({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string }>
}) {
  const [{ auth }, supabase, user] = await Promise.all([
    searchParams,
    createServerClient(),
    getCurrentUser(),
  ])
  if (!user) redirect(router.setup(router.account()))

  const profile = await getProfile(supabase, user.id)
  const pseudo = displayPseudo(profile?.pseudo)
  const isAnonymous = Boolean(user.is_anonymous)
  const emailConfirmed = Boolean(user.email_confirmed_at) && !isAnonymous
  const pendingEmail = user.new_email ?? (!emailConfirmed ? user.email : null)
  const hasPassword = emailConfirmed && Boolean(user.app_metadata?.providers?.includes('email'))
  const linkedProviders = linkedOAuthProviders(user.app_metadata?.providers)
  const linkableProviders = PROVIDERS.filter((provider) => !linkedProviders.includes(provider))
  const authMessage = authNotice(auth)

  return (
    <>
      <FormMessage error={authMessage?.error} success={authMessage?.success} />
      {auth === 'identity_taken' && (
        // Se connecter quitte cet utilisateur-ci : c'est bien l'autre compte, celui
        // qui porte déjà l'identité, que la personne cherche à retrouver.
        <p className="-mt-3 text-sm">
          <Link href={router.login()} className="font-medium text-brand hover:underline">
            Se connecter avec ce compte
          </Link>
        </p>
      )}

      <section className="flex items-center gap-4 rounded-lg bg-surface p-4 ring-1 ring-line">
        <Avatar name={pseudo} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-display text-lg font-bold">{pseudo}</p>
          {emailConfirmed ? (
            <Badge variant="yes">
              <RiShieldCheckLine aria-hidden="true" />
              Compte lié · {user.email}
            </Badge>
          ) : (
            <Badge variant="outline">Invité · sans compte</Badge>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold">Pseudo</h2>
        <UpdatePseudoForm currentPseudo={profile?.pseudo ?? ''} />
      </section>

      <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <RiMailLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
            Retrouver mes listes ailleurs
          </h2>
          <p className="text-sm text-muted-foreground">{ACCOUNT_INTRO}</p>
        </div>

        {linkedProviders.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Identités liées">
            {linkedProviders.map((provider) => (
              <li key={provider}>
                <Badge variant="yes">
                  <RiCheckLine aria-hidden="true" />
                  Lié à {OAUTH_PROVIDER_LABELS[provider]}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {linkableProviders.length > 0 && (
          <OAuthButtons providers={linkableProviders} intent="link" />
        )}

        {PROVIDERS.length > 0 && <OrSeparator>ou avec un email et un mot de passe</OrSeparator>}

        <ol className="flex flex-col gap-4">
          <li className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <StepMark done={emailConfirmed} index={1} />
              Lier une adresse email
            </p>
            {emailConfirmed ? (
              <p className="pl-8 text-sm text-muted-foreground">{user.email}</p>
            ) : (
              <div className="pl-8">
                <LinkEmailForm pendingEmail={pendingEmail} />
              </div>
            )}
          </li>
          <li className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <StepMark done={hasPassword} index={2} />
              Définir un mot de passe
            </p>
            {emailConfirmed ? (
              <div className="pl-8">
                <SetPasswordForm hasPassword={hasPassword} />
              </div>
            ) : (
              <p className="pl-8 text-sm text-muted-foreground">
                Disponible une fois l’email confirmé.
              </p>
            )}
          </li>
        </ol>
      </section>

      <div className="flex justify-center pt-2">
        <SignOutButton isAnonymous={isAnonymous} />
      </div>
    </>
  )
}

function StepMark({ done, index }: { done: boolean; index: number }) {
  return (
    <span
      aria-hidden="true"
      className={
        done
          ? 'flex size-6 items-center justify-center rounded-full bg-yes text-surface'
          : 'flex size-6 items-center justify-center rounded-full bg-surface-2 font-mono text-xs text-muted-foreground'
      }
    >
      {done ? <RiCheckLine className="size-3.5" /> : index}
    </span>
  )
}

/**
 * Silhouette de la page compte. Les intitulés — « Pseudo », le parcours de
 * liaison d'email et ses deux étapes — sont les mêmes pour tout le monde :
 * seules l'identité et l'avancée réelle des étapes attendent le serveur.
 */
export function AccountDetailsFallback() {
  return (
    <>
      <section
        aria-busy="true"
        className="flex items-center gap-4 rounded-lg bg-surface p-4 ring-1 ring-line"
      >
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-44 rounded-full" />
        </div>
      </section>

      <section aria-busy="true" className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold">Pseudo</h2>
        <p className="text-sm leading-none font-medium text-ink">Pseudo</p>
        <div className="flex gap-2">
          <Skeleton className="h-11 flex-1 rounded-md" />
          <Skeleton className="h-11 w-32 rounded-md" />
        </div>
      </section>

      <section
        aria-busy="true"
        className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line"
      >
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <RiMailLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
            Retrouver mes listes ailleurs
          </h2>
          <p className="text-sm text-muted-foreground">{ACCOUNT_INTRO}</p>
        </div>

        {PROVIDERS.length > 0 && (
          <>
            <div className="flex flex-col gap-2">
              {PROVIDERS.map((provider) => (
                <Skeleton key={provider} className="h-12 w-full rounded-md" />
              ))}
            </div>
            <OrSeparator>ou avec un email et un mot de passe</OrSeparator>
          </>
        )}

        <ol className="flex flex-col gap-4">
          <li className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Skeleton as="span" className="size-6 shrink-0 rounded-full" />
              Lier une adresse email
            </p>
            <div className="pl-8">
              <Skeleton className="h-11 w-full rounded-md" />
            </div>
          </li>
          <li className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Skeleton as="span" className="size-6 shrink-0 rounded-full" />
              Définir un mot de passe
            </p>
            <div className="pl-8">
              <Skeleton className="h-5 w-64 max-w-full" />
            </div>
          </li>
        </ol>
      </section>

      <div className="flex justify-center pt-2">
        <Skeleton className="h-11 w-40 rounded-md" />
      </div>
    </>
  )
}
