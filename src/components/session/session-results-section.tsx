import { RiTrophyLine } from '@remixicon/react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { SaveGroupForm } from '@/components/groups/save-group-form'
import { PageHeader, PageHeaderFallback } from '@/components/layout/page-header'
import { SessionCompletedMarker } from '@/components/pwa/session-completed-marker'
import { DecisionPanel } from '@/components/session/decision-panel'
import { ResultsList } from '@/components/session/results-list'
import { ResultsSharing } from '@/components/session/results-sharing'
import { ResultsWatch } from '@/components/session/results-watch'
import { TiebreakPanel } from '@/components/session/tiebreak-panel'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import {
  getRunoffSession,
  getSessionByParam,
  getSessionParticipants,
  getSessionResults,
} from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { decisionCandidates, headlineOf, readDecision } from '@/domain/decision'
import { duoAgreement } from '@/domain/duo'
import { isDuoSession, parseSessionRules } from '@/domain/session-rules'
import { readTiebreak } from '@/domain/tiebreak'
import { absoluteUrl, publicResultsUrl } from '@/lib/site'
import { cn } from '@/lib/utils'

/** Classement final d'une session : réservé à ses participants (RLS). */
export async function SessionResultsSection({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, supabase, user, t, tCommon] = await Promise.all([
    params,
    createServerClient(),
    getCurrentUser(),
    getTranslations('session.results.page'),
    getTranslations('common'),
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

  // Le restaurant annoncé : la décision du host s'il l'a posée, le premier
  // du vote sinon. C'est lui que le partage nomme.
  const winner = headlineOf(results)
  const tiebreak = readTiebreak(results)
  const decision = readDecision(results)
  const isHost = session.host_id === user.id
  // Un duo tombé d'accord (#61) : un résultat, pas un classement — ni
  // départage ni « On y va », la décision est déjà posée par l'accord. Un
  // duo sans accord retombe sur le classement habituel.
  const duo = isDuoSession(parseSessionRules(session.rules))
  const agreement = duo ? duoAgreement(results) : null

  // Le second tour ne se lit que s'il existe : une lecture de plus, seulement
  // pour les rares classements qui en sont là.
  const runoff = tiebreak?.method === 'runoff' ? await getRunoffSession(supabase, session.id) : null

  return (
    <>
      <PageHeader
        eyebrow={agreement ? t('agreementEyebrow') : t('eyebrow')}
        title={session.name}
        description={t('description', {
          participants: participants.length,
          restaurants: results.length,
        })}
        back={{ href: router.home(), label: tCommon('actions.home') }}
      />

      {winner ? (
        <ResultsList
          results={results}
          participantCount={participants.length}
          agreement={agreement !== null}
          actions={
            <>
              <ResultsWatch sessionId={session.id} />
              {/* Un classement avec un gagnant : la session a servi, l'app
                  pourra proposer de s'installer au prochain passage. */}
              <SessionCompletedMarker />
              {/* Retenir l'un des ex æquo tranche aussi l'égalité : le panneau
                  de départage n'a alors plus rien à proposer. Un second tour
                  déjà lancé reste signalé, avec son lien. */}
              {!agreement &&
                tiebreak &&
                tiebreak.method !== 'draw' &&
                !(decision && tiebreak.method === null) && (
                  <TiebreakPanel
                    sessionId={session.id}
                    tiedNames={tiebreak.tied.map((row) => row.name)}
                    method={tiebreak.method}
                    isHost={isHost}
                    runoff={
                      runoff
                        ? {
                            url:
                              runoff.status === 'closed'
                                ? router.sessionResults(runoff)
                                : router.session(runoff),
                            status: runoff.status,
                          }
                        : null
                    }
                  />
                )}
              {/* Le parent d'un second tour n'a rien à confirmer : c'est la
                  session fille qui désigne où le groupe va. */}
              {isHost && !agreement && tiebreak?.method !== 'runoff' && (
                <DecisionPanel
                  sessionId={session.id}
                  candidates={decisionCandidates(results)}
                  decidedId={decision?.decided.restaurant_id ?? null}
                />
              )}
              <ResultsSharing
                sessionId={session.id}
                sessionName={session.name}
                winnerName={winner.name}
                privateUrl={absoluteUrl(router.sessionResults(session))}
                publicUrl={publicResultsUrl(session)}
                isHost={isHost}
                initialPublic={session.results_public}
              />
              <div className="flex flex-wrap gap-2">
                {duo ? (
                  <Link href={router.duo()} className={cn(buttonVariants())}>
                    {t('again')}
                  </Link>
                ) : (
                  <Link href={router.sessionNew()} className={cn(buttonVariants())}>
                    {t('newSession')}
                  </Link>
                )}
                {!duo && <SaveGroupForm sessionId={session.id} memberCount={participants.length} />}
              </div>
            </>
          }
        />
      ) : (
        <EmptyState
          icon={<RiTrophyLine />}
          title={t('empty')}
          description={t('emptyDescription')}
          action={
            <Link href={router.home()} className={cn(buttonVariants())}>
              {tCommon('actions.home')}
            </Link>
          }
        />
      )}
    </>
  )
}

/**
 * Silhouette du classement : le surtitre, le retour et le titre du bas de
 * page sont les mêmes pour toutes les sessions et s'affichent en clair. Seuls
 * le nom de la session, le podium et les scores attendent la base.
 */
export function SessionResultsFallback() {
  const t = useTranslations('session.results')
  const tCommon = useTranslations('common')
  return (
    <>
      <PageHeaderFallback
        eyebrow={t('page.eyebrow')}
        back={{ href: router.home(), label: tCommon('actions.home') }}
        description
      />
      <div
        aria-busy="true"
        className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-10"
      >
        <Skeleton className="h-64 w-full rounded-xl lg:h-80" />
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-base font-semibold">{t('rest')}</h2>
          <SkeletonResult nameWidth="max-w-40" />
          <SkeletonResult nameWidth="max-w-32" />
          <SkeletonResult nameWidth="max-w-36" />
        </section>
      </div>
    </>
  )
}

/** Rangée du classement : rang, nom, score, puis la barre et le détail. */
function SkeletonResult({ nameWidth }: { nameWidth: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-4 ring-1 ring-line">
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-7" />
        <Skeleton className={cn('h-5 flex-1', nameWidth)} />
        <Skeleton className="h-5 w-8" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <Skeleton className="h-4 w-36" />
    </div>
  )
}
