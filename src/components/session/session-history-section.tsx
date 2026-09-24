import { RiArrowLeftLine, RiArrowRightLine, RiHistoryLine } from '@remixicon/react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { VisitMemo } from '@/components/layout/visit-memo'
import { SessionHistoryList } from '@/components/session/session-history-list'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRow } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getMySessionHistory } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { parseSessionCursor } from '@/domain/history'
import { cn } from '@/lib/utils'

/**
 * Historique des sessions de la personne connectée : la partie personnalisée
 * de `/sessions`. Une session close ne disparaît plus de la navigation — elle
 * reste ici, et son classement s'ouvre en un clic, jusqu'à ce que la
 * rétention la purge.
 */
export async function SessionHistorySection({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>
}) {
  const [{ cursor }, supabase, user] = await Promise.all([
    searchParams,
    createServerClient(),
    getCurrentUser(),
  ])
  if (!user) redirect(router.setup(router.sessions()))

  const { entries, nextCursor } = await getMySessionHistory(supabase, { cursor })
  // Une page suivante vide ne veut pas dire « aucune session » : seule la
  // première page peut renseigner la silhouette de la prochaine visite.
  const isFirstPage = parseSessionCursor(cursor) === null

  if (entries.length === 0) {
    if (!isFirstPage) return <EndOfHistory />
    return (
      <>
        <VisitMemo account sessions={false} />
        <NoSessions />
      </>
    )
  }

  return (
    <>
      {isFirstPage && <VisitMemo account sessions />}
      <SessionHistoryList entries={entries} />
      <nav aria-label="Pagination" className="flex flex-wrap justify-between gap-2">
        {isFirstPage ? <span /> : <BackToTop />}
        {nextCursor && (
          <Link
            href={router.sessions({ cursor: nextCursor })}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            Sessions plus anciennes
            <RiArrowRightLine aria-hidden="true" />
          </Link>
        )}
      </nav>
    </>
  )
}

/** Retour à la première page : un curseur ne sait pas revenir en arrière. */
function BackToTop() {
  return (
    <Link
      href={router.sessions()}
      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
    >
      <RiArrowLeftLine aria-hidden="true" />
      Les plus récentes
    </Link>
  )
}

/** Écran vide de l'historique — partagé avec la silhouette, qui sait le rendre. */
function NoSessions() {
  return (
    <EmptyState
      icon={<RiHistoryLine />}
      title="Aucune session pour l’instant"
      description="Lance une session ou rejoins celle d’un collègue : elle restera consultable ici, classement compris."
      action={
        <Link href={router.sessionNew()} className={cn(buttonVariants())}>
          Créer une session
        </Link>
      }
    />
  )
}

/** Curseur périmé ou recopié à la main : on le dit, et on remonte. */
function EndOfHistory() {
  return (
    <EmptyState
      icon={<RiHistoryLine />}
      title="Fin de l’historique"
      description="Il n’y a rien de plus ancien à afficher."
      action={<BackToTop />}
    />
  )
}

/**
 * Silhouette de l'historique, accordée à la dernière visite : des rangées
 * pour qui avait des sessions, l'écran vide — déjà le bon — pour qui n'en
 * avait pas, et rien pour un premier passage, que `/sessions` renvoie de
 * toute façon vers l'onboarding.
 */
export function SessionHistoryFallback() {
  return (
    <>
      <div aria-busy="true" className="hidden flex-col gap-2 seen-sessions:flex">
        <SkeletonRow nameWidth="w-44" badgeWidth="w-20" />
        <SkeletonRow nameWidth="w-32" badgeWidth="w-16" />
        <SkeletonRow nameWidth="w-40" badgeWidth="w-20" />
      </div>
      <div className="hidden seen-no-sessions:block">
        <NoSessions />
      </div>
    </>
  )
}
