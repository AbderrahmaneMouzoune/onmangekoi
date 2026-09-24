import { RiBarChartLine } from '@remixicon/react'
import Link from 'next/link'

import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getMyStats } from '@/data-access/stats'
import { createServerClient } from '@/data-access/supabase/server'
import { favoriteRate } from '@/domain/history'
import { countLabel, percentLabel } from '@/lib/format'

import type { MyStats } from '@/data-access/models'

/**
 * Ce que mes sessions racontent de moi : combien j'en ai faites, ce que je
 * vote, quelle cuisine revient, quel resto gagne le plus souvent.
 *
 * Tout est compté en base par `my_stats`, sur mes seules participations : les
 * votes des autres n'entrent nulle part. Le resto le plus souvent gagnant
 * vient du classement d'une session close — une agrégation que ses
 * participants voient déjà.
 */
export async function AccountStats() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return null

  const stats = await getMyStats(supabase)
  return <StatsPanel stats={stats} />
}

/** Le panneau lui-même, sans lecture : `null` ou zéro session donnent l'invite. */
export function StatsPanel({ stats }: { stats: MyStats | null }) {
  const rate = stats ? favoriteRate(stats.fav_votes, stats.votes_total) : null

  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <RiBarChartLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
          Mes statistiques
        </h2>
        <Link href={router.sessions()} className="text-sm font-medium text-brand hover:underline">
          Historique
        </Link>
      </div>

      {!stats || stats.sessions_total === 0 ? (
        <p className="text-sm text-muted-foreground">
          Rien à compter pour l’instant. Après ta première session, tu retrouveras ici tes votes, ta
          cuisine préférée et le resto qui gagne le plus souvent.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <Tile
              label="Sessions"
              value={stats.sessions_total}
              hint={countLabel(stats.sessions_hosted, 'organisée')}
            />
            <Tile
              label="Votes"
              value={stats.votes_total}
              hint={countLabel(stats.veto_votes, 'veto')}
            />
            <Tile
              label="Coups de cœur"
              value={rate === null ? '—' : percentLabel(rate)}
              hint={countLabel(stats.fav_votes, 'vote')}
            />
          </dl>

          <dl className="flex flex-col gap-2 text-sm">
            <Fact
              term="Cuisine préférée"
              value={stats.favorite_cuisine}
              hint={
                stats.favorite_cuisine
                  ? countLabel(stats.favorite_cuisine_votes, 'vote positif', 'votes positifs')
                  : undefined
              }
            />
            <Fact
              term="Resto le plus souvent choisi"
              value={stats.top_restaurant_name}
              hint={
                stats.top_restaurant_name
                  ? countLabel(stats.top_restaurant_wins, 'victoire')
                  : undefined
              }
            />
            <Fact term="Sessions terminées" value={String(stats.sessions_closed)} />
          </dl>

          <p className="text-xs text-muted-foreground">
            Ces chiffres ne comptent que tes votes à toi — jamais ceux des autres participants.
          </p>
        </>
      )}
    </section>
  )
}

/** Chiffre mis en avant : la valeur, ce qu'elle mesure, et sa précision. */
function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-2 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xl font-bold tabular">{value}</dd>
      {hint && <p className="text-[0.7rem] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Ligne « intitulé → réponse », avec un tiret quand la réponse manque. */
function Fact({ term, value, hint }: { term: string; value: string | null; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right">
        <span className="truncate font-semibold">{value ?? '—'}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  )
}

/**
 * Silhouette du panneau : le titre, le lien vers l'historique et la grille
 * sont les mêmes pour tout le monde et s'affichent en clair. Seuls les
 * chiffres attendent la base.
 */
export function AccountStatsFallback() {
  return (
    <section
      aria-busy="true"
      className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <RiBarChartLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
          Mes statistiques
        </h2>
        <Link href={router.sessions()} className="text-sm font-medium text-brand hover:underline">
          Historique
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-[4.25rem] rounded-md" />
        <Skeleton className="h-[4.25rem] rounded-md" />
        <Skeleton className="h-[4.25rem] rounded-md" />
      </div>
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-2/3" />
    </section>
  )
}
