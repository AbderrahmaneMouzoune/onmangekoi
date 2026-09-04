import { RiTrophyLine } from '@remixicon/react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { ResultsList } from '@/components/session/results-list'
import { ShareResultsButton } from '@/components/session/share-results-button'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { getSessionById, getSessionParticipants, getSessionResults } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { countLabel } from '@/lib/format'
import { setupHref } from '@/lib/routing'
import { SessionIdSchema } from '@/lib/schemas/session'
import { absoluteUrl } from '@/lib/site'
import { cn } from '@/lib/utils'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  if (!SessionIdSchema.safeParse(id).success) return { title: 'Classement' }
  const supabase = await createServerClient()
  const session = await getSessionById(supabase, id).catch(() => null)
  return {
    title: session ? `Classement · ${session.name}` : 'Classement',
    robots: { index: false },
  }
}

export default async function ResultsPage({ params }: Props) {
  const { id } = await params
  if (!SessionIdSchema.safeParse(id).success) notFound()

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(setupHref(`/sessions/${id}/results`))

  const session = await getSessionById(supabase, id)
  if (!session) notFound()
  if (session.status !== 'closed') redirect(`/sessions/${id}`)

  const [results, participants] = await Promise.all([
    getSessionResults(supabase, id),
    getSessionParticipants(supabase, id),
  ])

  const winner = results[0]

  return (
    <Shell wide>
      <PageHeader
        eyebrow="Classement final"
        title={session.name}
        description={`${countLabel(participants.length, 'participant')} · ${countLabel(results.length, 'resto')}`}
        back={{ href: '/', label: 'Accueil' }}
      />

      {winner ? (
        <>
          <ResultsList results={results} participantCount={participants.length} />
          <div className="flex flex-wrap gap-2">
            <ShareResultsButton
              url={absoluteUrl(`/sessions/${id}/results`)}
              sessionName={session.name}
              winnerName={winner.name}
            />
            <Link href="/sessions/new" className={cn(buttonVariants())}>
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
            <Link href="/" className={cn(buttonVariants())}>
              Accueil
            </Link>
          }
        />
      )}
    </Shell>
  )
}
