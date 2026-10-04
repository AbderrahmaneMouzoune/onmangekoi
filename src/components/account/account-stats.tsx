import { RiBarChartLine } from '@remixicon/react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getMyStats } from '@/data-access/stats'
import { createServerClient } from '@/data-access/supabase/server'
import { favoriteRate } from '@/domain/history'
import { percentLabel } from '@/lib/format'

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
  const locale = useLocale()
  const t = useTranslations('account.stats')
  const rate = stats ? favoriteRate(stats.fav_votes, stats.votes_total) : null

  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
      <StatsHeading />

      {!stats || stats.sessions_total === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <Tile
              label={t('sessions')}
              value={stats.sessions_total}
              hint={t('sessionsHint', { count: stats.sessions_hosted })}
            />
            <Tile
              label={t('votes')}
              value={stats.votes_total}
              hint={t('votesHint', { count: stats.veto_votes })}
            />
            <Tile
              label={t('favourites')}
              value={rate === null ? NONE : percentLabel(rate, locale)}
              hint={t('favouritesHint', { count: stats.fav_votes })}
            />
          </dl>

          <dl className="flex flex-col gap-2 text-sm">
            <Fact
              term={t('favoriteCuisine')}
              value={stats.favorite_cuisine}
              hint={
                stats.favorite_cuisine
                  ? t('favoriteCuisineHint', { count: stats.favorite_cuisine_votes })
                  : undefined
              }
            />
            <Fact
              term={t('topRestaurant')}
              value={stats.top_restaurant_name}
              hint={
                stats.top_restaurant_name
                  ? t('topRestaurantHint', { count: stats.top_restaurant_wins })
                  : undefined
              }
            />
            <Fact term={t('sessionsClosed')} value={String(stats.sessions_closed)} />
          </dl>

          <p className="text-xs text-muted-foreground">{t('privacy')}</p>
        </>
      )}
    </section>
  )
}

/** Tiret des valeurs manquantes : un signe, pas un mot. */
const NONE = '—'

/** Le titre et le lien vers l'historique, les mêmes pour tout le monde (silhouette comprise). */
function StatsHeading() {
  const t = useTranslations('account.stats')
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <RiBarChartLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
        {t('title')}
      </h2>
      <Link href={router.sessions()} className="text-sm font-medium text-brand hover:underline">
        {t('history')}
      </Link>
    </div>
  )
}

/**
 * Chiffre mis en avant : la valeur, ce qu'elle mesure, et sa précision. La
 * précision est un second `<dd>` : dans un `<dl>`, un groupe ne contient que
 * des `<dt>` et des `<dd>`, sinon les lecteurs d'écran perdent l'association.
 */
function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-2 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xl font-bold tabular">{value}</dd>
      {hint && <dd className="text-[0.7rem] text-muted-foreground">{hint}</dd>}
    </div>
  )
}

/** Ligne « intitulé → réponse », avec un tiret quand la réponse manque. */
function Fact({ term, value, hint }: { term: string; value: string | null; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right">
        <span className="truncate font-semibold">{value ?? NONE}</span>
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
      <StatsHeading />
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
