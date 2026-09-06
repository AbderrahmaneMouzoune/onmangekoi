import { RiArrowRightLine } from '@remixicon/react'
import Link from 'next/link'

import { SessionStatusBadge } from '@/components/session/session-status-badge'
import { Skeleton, SkeletonRow } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getListsByOwner } from '@/data-access/lists'
import { getMySessions } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { countLabel, relativeDate } from '@/lib/format'

/**
 * Sessions et listes de la personne connectée : la seule partie personnalisée
 * de l'accueil. Isolée dans son `<Suspense>`, elle laisse le reste de la page
 * (titre, boutons, « comment ça marche ») être prérendu et servi depuis le
 * cache. Un visiteur sans pseudo n'affiche rien ici.
 */
export async function HomeDashboard() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return null

  // Les deux lectures sont indépendantes : un seul aller-retour de latence.
  const [sessions, lists] = await Promise.all([
    getMySessions(supabase),
    getListsByOwner(supabase, user.id),
  ])

  return (
    <>
      {sessions.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Tes sessions</h2>
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={
                    session.status === 'closed'
                      ? router.sessionResults(session)
                      : router.session(session)
                  }
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface p-4 ring-1 ring-line transition-colors hover:bg-surface-2"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold">{session.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {countLabel(session.participant_count, 'participant')} ·{' '}
                      {relativeDate(session.created_at)}
                    </span>
                  </div>
                  <SessionStatusBadge status={session.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Tes listes</h2>
          <Link href={router.lists()} className="text-sm font-medium text-brand hover:underline">
            Tout voir
          </Link>
        </div>
        {lists.length === 0 ? (
          <Link
            href={router.listNew()}
            className="flex items-center justify-between rounded-lg border border-dashed border-line-strong p-4 text-sm text-ink-2 hover:bg-surface-2"
          >
            <span>Crée ta première liste de favoris</span>
            <RiArrowRightLine aria-hidden="true" className="size-4" />
          </Link>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {lists.slice(0, 6).map((list) => (
              <li key={list.id}>
                <Link
                  href={router.list(list)}
                  className="inline-flex items-center gap-2 rounded-full bg-surface px-3.5 py-2 text-sm font-medium ring-1 ring-line hover:bg-surface-2"
                >
                  {list.name}
                  <span className="font-mono text-xs text-muted-foreground tabular">
                    {list.restaurant_count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/**
 * Silhouette du tableau de bord. Les deux titres de section et le lien « Tout
 * voir » ne dépendent d'aucune donnée : ils s'affichent en clair dès le
 * prérendu — seules les cartes, elles, restent en attente.
 */
export function HomeDashboardFallback() {
  return (
    <>
      <section aria-busy="true" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Tes sessions</h2>
        <div className="flex flex-col gap-2">
          <SkeletonRow nameWidth="w-44" badgeWidth="w-20" />
          <SkeletonRow nameWidth="w-32" badgeWidth="w-16" />
        </div>
      </section>

      <section aria-busy="true" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Tes listes</h2>
          <Link href={router.lists()} className="text-sm font-medium text-brand hover:underline">
            Tout voir
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </section>
    </>
  )
}
