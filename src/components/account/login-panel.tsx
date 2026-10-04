import Link from 'next/link'
import { redirect } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { LoginForm } from '@/components/account/login-form'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { sanitizeNextPath } from '@/lib/routing'

/** Formulaire de connexion : dépend de `?next=` et de la session en cours. */
export async function LoginPanel({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next: rawNext }, user, t] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getTranslations('account.login'),
  ])
  const next = sanitizeNextPath(rawNext, router.home())
  if (user && !user.is_anonymous) redirect(next)

  return (
    <>
      <LoginIntro />

      <LoginForm next={next !== router.home() ? next : undefined} />

      <p className="text-center text-sm text-muted-foreground">
        {t.rich('noAccount', {
          link: (chunks) => (
            <Link href={router.setup(next)} className="font-medium text-brand hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </>
  )
}

/**
 * Rien de ce texte ne dépend des données : le titre, l'accroche et les
 * intitulés du formulaire s'affichent en clair dès le prérendu. Seuls les
 * champs — que la redirection `?next=` peut encore faire disparaître —
 * restent en attente.
 */
export function LoginPanelFallback() {
  const t = useTranslations('account.login')
  return (
    <div aria-busy="true" className="flex flex-col gap-8">
      <LoginIntro />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-none font-medium text-ink">{t('email')}</p>
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-none font-medium text-ink">{t('password')}</p>
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
        <Skeleton className="h-12 w-full rounded-md" />
      </div>

      <Skeleton className="h-5 w-64 max-w-full self-center" />
    </div>
  )
}

/** Titre et accroche : les mêmes au prérendu et une fois la page prête. */
function LoginIntro() {
  const t = useTranslations('account.login')
  return (
    <div className="flex flex-col gap-2">
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1 className="text-3xl font-extrabold">{t('title')}</h1>
      <p className="text-sm text-ink-2">{t('description')}</p>
    </div>
  )
}
