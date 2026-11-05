import { RiCheckLine, RiErrorWarningLine, RiExternalLinkLine, RiPlugLine } from '@remixicon/react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import {
  isConsentRedirect,
  readAuthorizationId,
  redirectTarget,
  safeHttpUrl,
} from '@/components/account/oauth'
import { OAuthConsentForm } from '@/components/account/oauth-consent-form'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getProfile } from '@/data-access/profile'
import { createServerClient } from '@/data-access/supabase/server'
import { displayPseudo } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Ce que l'app pourra faire, dans l'ordre : lire, créer, agir sur demande. */
const CAPABILITIES = ['read', 'create', 'act'] as const

/**
 * Écran de consentement OAuth : une app (client MCP — Claude, ChatGPT…)
 * demande l'accès au compte. Tout dépend de la requête (`authorization_id`)
 * et de la session : c'est le trou dynamique de `/oauth/consent`.
 *
 * Si la personne a déjà consenti à ces accès, Supabase renvoie directement
 * l'URL de retour : on y repart sans rien afficher.
 */
export async function OAuthConsentPanel({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string | string[] }>
}) {
  const [{ authorization_id: rawId }, supabase, user, t] = await Promise.all([
    searchParams,
    createServerClient(),
    getCurrentUser(),
    getTranslations('oauth.consent'),
  ])

  const authorizationId = readAuthorizationId(rawId)
  if (!authorizationId) {
    return <ConsentError title={t('errors.missingTitle')} description={t('errors.missing')} />
  }
  // Le proxy garde déjà `/oauth` ; une session expirée entre-temps repasse
  // par l'onboarding avec la demande intacte.
  if (!user) redirect(router.setup(router.oauthConsent(authorizationId)))

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !data) {
    return <ConsentError title={t('errors.invalidTitle')} description={t('errors.invalid')} />
  }
  if (isConsentRedirect(data)) redirect(data.redirect_url)

  const [profile, tCommon] = await Promise.all([
    getProfile(supabase, user.id),
    getTranslations('common'),
  ])
  const pseudo = displayPseudo(profile?.pseudo, tCommon('people.guest'))
  const isAnonymous = Boolean(user.is_anonymous)

  const clientName = data.client.name?.trim() || null
  const website = safeHttpUrl(data.client.uri)
  const logo = safeHttpUrl(data.client.logo_uri)
  const client = clientName ?? website?.host ?? null
  const target = redirectTarget(data.redirect_uri)

  return (
    <article className="flex flex-col gap-6" aria-labelledby="oauth-consent-title">
      <header className="flex flex-col items-center gap-3 text-center">
        <ClientLogo logo={logo} alt={client ? t('logoAlt', { client }) : ''} />
        <p className="font-mono text-[0.7rem] tracking-[0.12em] text-muted-foreground uppercase">
          {t('eyebrow')}
        </p>
        <h1 id="oauth-consent-title" className="font-display text-2xl leading-tight font-bold">
          {client ? t('title', { client }) : t('titleFallback')}
        </h1>
        {client && <p className="text-sm text-muted-foreground">{t('intro', { client })}</p>}
        {website && (
          <a
            href={website.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            {t('website', { host: website.host })}
            <RiExternalLinkLine aria-hidden="true" className="size-3.5" />
          </a>
        )}
        {target && (
          <p className="text-sm text-muted-foreground">
            {t.rich('redirect', {
              target,
              strong: (chunks) => <strong className="font-mono text-foreground">{chunks}</strong>,
            })}
          </p>
        )}
      </header>

      <section
        aria-labelledby="oauth-consent-can"
        className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line"
      >
        <h2 id="oauth-consent-can" className="font-display text-base font-semibold">
          {t('canTitle')}
        </h2>
        <ul className="flex flex-col gap-2 text-sm">
          {CAPABILITIES.map((key) => (
            <li key={key} className="flex items-start gap-2">
              <RiCheckLine aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-yes" />
              {t(`can.${key}`)}
            </li>
          ))}
        </ul>
      </section>

      {/* Pas de « ce qu'elle ne pourra pas faire » : le jeton porte les droits
          de l'utilisateur (RLS, RPC `authenticated`, email dans le JWT), pas
          des scopes métier. On le dit tel quel plutôt que de promettre. */}
      <section
        aria-labelledby="oauth-consent-trust"
        className="flex flex-col gap-2 rounded-lg bg-surface p-4 ring-1 ring-line"
      >
        <h2 id="oauth-consent-trust" className="font-display text-base font-semibold">
          {t('trustTitle')}
        </h2>
        <p className="flex items-start gap-2 text-sm text-ink-2">
          <RiErrorWarningLine aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('trust')}
        </p>
      </section>

      <section
        aria-labelledby="oauth-consent-account"
        className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line"
      >
        <h2 id="oauth-consent-account" className="font-display text-base font-semibold">
          {t('accountTitle')}
        </h2>
        <div className="flex items-center gap-3">
          <Avatar name={pseudo} />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate font-semibold">{pseudo}</p>
            {isAnonymous && <Badge variant="outline">{t('anonymous')}</Badge>}
          </div>
        </div>
        {isAnonymous && (
          <div className="flex flex-col gap-2 rounded-md bg-surface-2 p-3 text-sm">
            <p className="flex items-start gap-2 text-ink-2">
              <RiErrorWarningLine aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t('anonymousHint')}
            </p>
            <Link
              href={router.account()}
              target="_blank"
              className="self-start font-medium text-brand hover:underline"
            >
              {t('linkEmail')}
            </Link>
          </div>
        )}
      </section>

      <p className="text-center text-sm text-muted-foreground">{t('revokeHint')}</p>

      <OAuthConsentForm
        authorizationId={data.authorization_id}
        labels={{ approve: t('approve'), deny: t('deny') }}
      />
    </article>
  )
}

/**
 * Logo déclaré par le client : un simple `<img>`, pas `next/image` — l'hôte
 * est choisi par l'app elle-même à son enregistrement (DCR) et ne peut pas
 * figurer d'avance dans `images.remotePatterns`. Pas de référent envoyé.
 */
function ClientLogo({ logo, alt }: { logo: URL | null; alt: string }) {
  if (!logo) {
    return (
      <span className="flex size-14 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
        <RiPlugLine aria-hidden="true" className="size-7" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- hôte arbitraire, voir ci-dessus
    <img
      src={logo.href}
      alt={alt}
      width={56}
      height={56}
      referrerPolicy="no-referrer"
      loading="eager"
      className="size-14 rounded-lg bg-surface-2 object-contain ring-1 ring-line"
    />
  )
}

/**
 * État d'erreur : rien à autoriser, la demande est à relancer depuis l'app.
 * Le titre de page reste un `<h1>` (lu par les lecteurs d'écran), le détail
 * vit dans l'état vide.
 */
function ConsentError({ title, description }: { title: string; description: string }) {
  const tCommon = useTranslations('common')
  const tTitles = useTranslations('metadata.titles')
  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{tTitles('oauthConsent')}</h1>
      <EmptyState
        icon={<RiErrorWarningLine aria-hidden="true" />}
        title={title}
        description={description}
        action={
          <Link href={router.home()} className={cn(buttonVariants({ variant: 'outline' }))}>
            {tCommon('actions.backHome')}
          </Link>
        }
      />
    </div>
  )
}

/** Silhouette de l'écran de consentement, le temps de lire la demande. */
export function OAuthConsentPanelFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="size-14 rounded-lg" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-44 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="flex justify-end gap-2">
        <Skeleton className="h-11 w-28 rounded-md" />
        <Skeleton className="h-11 w-28 rounded-md" />
      </div>
    </div>
  )
}
