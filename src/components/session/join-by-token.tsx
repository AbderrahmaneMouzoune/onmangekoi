import { RiErrorWarningLine } from '@remixicon/react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getSessionPreview } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { joinSessionUseCase } from '@/use-cases/join-session'

/**
 * Inscription effective dans la session. Cette étape *écrit* en base : elle
 * doit rester derrière un `<Suspense>` et n'est jamais mise en cache — seule la
 * coquille « on te fait entrer » est prérendue.
 */
export async function JoinByToken({ params }: { params: Promise<{ token: string }> }) {
  const [{ token: rawToken }, supabase, user] = await Promise.all([
    params,
    createServerClient(),
    getCurrentUser(),
  ])
  const identifier = decodeURIComponent(rawToken)

  if (!user) redirect(router.setup(router.joinInvite(identifier)))

  let sessionId: string | null = null
  let errorMessage: string | null = null
  try {
    const session = await joinSessionUseCase(supabase, identifier)
    sessionId = session.id
  } catch (error) {
    errorMessage = toUserMessage(error, 'Lien invalide ou session introuvable.')
  }

  if (sessionId) redirect(router.session(sessionId))

  const preview = await getSessionPreview(supabase, identifier).catch(() => null)

  return (
    <EmptyState
      icon={<RiErrorWarningLine />}
      title={preview ? `Impossible de rejoindre « ${preview.name} »` : 'Impossible de rejoindre'}
      description={errorMessage ?? undefined}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={router.join()} className={cn(buttonVariants({ variant: 'outline' }))}>
            Entrer un code
          </Link>
          <Link href={router.home()} className={cn(buttonVariants())}>
            Accueil
          </Link>
        </div>
      }
    />
  )
}

export function JoinByTokenFallback() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col items-center gap-3 text-muted-foreground"
    >
      <Spinner className="size-6" />
      <p className="text-sm">On te fait entrer…</p>
    </div>
  )
}
