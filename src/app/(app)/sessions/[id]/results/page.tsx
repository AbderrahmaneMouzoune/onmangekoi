import { RiTrophyLine } from '@remixicon/react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { ResultsList } from '@/components/session/results-list'
import { ShareResultsButton } from '@/components/session/share-results-button'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getSessionById, getSessionParticipants, getSessionResults } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { SessionIdSchema } from '@/domain/schemas/session'
import { countLabel } from '@/lib/format'
import { absoluteUrl } from '@/lib/site'
import { cn } from '@/lib/utils'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, supabase] = await Promise.all([params, createServerClient()])
  if (!SessionIdSchema.safeParse(id).success) return { title: 'Classement' }
  const session = await getSessionById(supabase, id).catch(() => null)
  return {
    title: session ? `Classement · ${session.name}` : 'Classement',
    robots: { index: false },
  }
}

export default async function ResultsPage({ params }: Props) {
  const [{ id }, supabase, user] = await Promise.all([
    params,
    createServerClient(),
    getCurrentUser(),
  ])
  if (!SessionIdSchema.safeParse(id).success) notFound()
  if (!user) redirect(router.setup(router.sessionResults(id)))

  // Les trois lectures sont indépendantes ; `session_results` renvoie vide
  // tant que la session n'est pas close, ce que le statut confirme ensuite.
  const [session, results, participants] = await Promise.all([
    getSessionById(supabase, id),
    getSessionResults(supabase, id),
    getSessionParticipants(supabase, id),
  ])

  if (!session) notFound()
  if (session.status !== 'closed') redirect(router.session(id))

  const winner = results[0]

  return (
    <Shell wide>
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
              url={absoluteUrl(router.sessionResults(id))}
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
    </Shell>
  )
}
