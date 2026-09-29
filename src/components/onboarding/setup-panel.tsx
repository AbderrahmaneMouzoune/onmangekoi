import Link from 'next/link'
import { redirect } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { PseudoForm } from '@/components/onboarding/pseudo-form'
import { RulesSummary } from '@/components/session/rules-summary'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getSessionPreview } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { parseSessionRules } from '@/domain/session-rules'
import { displayPseudo } from '@/lib/format'
import { sanitizeNextPath } from '@/lib/routing'

const JOIN_PATH = /^\/join\/([^/?#]+)(?:[?#].*)?$/

/**
 * Onboarding pseudo. Dépend de `?next=` et de l'aperçu de l'invitation : c'est
 * le trou dynamique de `/setup`, la barre du haut restant prérendue.
 */
export async function SetupPanel({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams
  const next = sanitizeNextPath(rawNext, router.home())
  const inviteIdentifier = next.match(JOIN_PATH)?.[1]

  // L'utilisateur et l'aperçu d'invitation sont indépendants : en parallèle.
  // L'aperçu est décoratif, une erreur réseau ne doit pas bloquer l'onboarding.
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  const preview = inviteIdentifier
    ? await getSessionPreview(supabase, decodeURIComponent(inviteIdentifier)).catch(() => null)
    : null

  if (user) redirect(next)

  const [t, tCommon] = await Promise.all([
    getTranslations('onboarding.setup'),
    getTranslations('common'),
  ])

  return (
    <>
      {preview ? (
        <div className="flex flex-col gap-3 rounded-lg chalkboard p-5 text-chalk">
          <p className="font-mono text-[0.7rem] tracking-[0.12em] text-chalk-muted uppercase">
            {t('invitation')}
          </p>
          <p className="font-display text-2xl leading-tight font-bold">{preview.name}</p>
          <p className="text-sm text-chalk-muted">
            {t('invitedBy', {
              host: displayPseudo(preview.host_pseudo, tCommon('people.guest')),
              restaurants: tCommon('counts.restaurants', { count: preview.restaurant_count }),
              participants: tCommon('counts.participants', { count: preview.participant_count }),
            })}
          </p>
          <RulesSummary rules={parseSessionRules(preview.rules)} tone="chalk" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className="text-3xl font-extrabold">{t('title')}</h1>
          <p className="text-sm text-ink-2">{t('lead')}</p>
        </div>
      )}

      {preview && <h1 className="text-2xl font-bold">{t('askName')}</h1>}

      <PseudoForm next={next !== router.home() ? next : undefined} joining={Boolean(preview)} />

      <p className="text-center text-sm text-muted-foreground">
        {t('hasAccount')}{' '}
        <Link href={router.login(next)} className="font-medium text-brand hover:underline">
          {t('signIn')}
        </Link>
      </p>
    </>
  )
}

/**
 * L'en-tête dépend de l'invitation éventuellement portée par `?next=` : elle
 * seule reste une silhouette. Le formulaire, lui, est le même pour tout le
 * monde — son intitulé et son aide s'affichent en clair.
 */
export function SetupPanelFallback() {
  const t = useTranslations('onboarding.pseudo')
  return (
    <div aria-busy="true" className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-5 w-full" />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-none font-medium text-ink">{t('label')}</p>
          <Skeleton className="h-12 w-full rounded-md" />
          <p className="text-xs text-muted-foreground">{t('help')}</p>
        </div>
        <Skeleton className="h-12 w-full rounded-md" />
      </div>

      <Skeleton className="h-5 w-48 max-w-full self-center" />
    </div>
  )
}
