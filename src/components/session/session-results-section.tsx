import { RiTrophyLine } from '@remixicon/react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { ResultsList } from '@/components/session/results-list'
import { ShareResultsButton } from '@/components/session/share-results-button'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import {
  getSessionByParam,
  getSessionParticipants,
  getSessionResults,
} from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { countLabel } from '@/lib/format'
import { absoluteUrl } from '@/lib/site'
import { cn } from '@/lib/utils'

/** Classement final d'une session : réservé à ses participants (RLS). */
export async function SessionResultsSection({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, supabase, user] = await Promise.all([
    params,
    createServerClient(),
    getCurrentUser(),
  ])
  if (!user) redirect(router.setup(router.sessionResults(code)))

  const session = await getSessionByParam(supabase, code)
  if (!session) notFound()
  if (session.status !== 'closed') redirect(router.session(session))

  const canonical = router.sessionResults(session)
  if (`/sessions/${code}/results` !== canonical) redirect(canonical)

  // `session_results` renvoie vide tant que la session n'est pas close,
  // ce que le statut a déjà confirmé.
  const [results, participants] = await Promise.all([
    getSessionResults(supabase, session.id),
    getSessionParticipants(supabase, session.id),
  ])

  const winner = results[0]

  return (
    <>
      <PageHeader
        eyebrow="Classement final"
        title={session.name}
        description={`${countLabel(participants.length, 'participant')} · ${countLabel(results.length, 'resto')}`}
        back={{ href: router.home(), label: 'Accueil' }}
      />

      {winner ? (
        <>
          <ResultsList results={results} participantCount={participants.length} />
          <div className="flex flex-wrap gap-2">
            <ShareResultsButton
              url={absoluteUrl(router.sessionResults(session))}
              sessionName={session.name}
              winnerName={winner.name}
            />
            <Link href={router.sessionNew()} className={cn(buttonVariants())}>
              Nouvelle session
            </Link>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<RiTrophyLine />}
          title="Aucun résultat"
          description="La session s’est terminée sans restaurant."
          action={
            <Link href={router.home()} className={cn(buttonVariants())}>
              Accueil
            </Link>
          }
        />
      )}
    </>
  )
}

export function SessionResultsFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </div>
  )
}
