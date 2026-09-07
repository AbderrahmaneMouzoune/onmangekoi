import { RiMapPin2Line, RiTrophyLine } from '@remixicon/react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PageHeader, PageHeaderFallback } from '@/components/layout/page-header'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getPublicResults } from '@/data-access/public-results'
import { parseResultsParam } from '@/domain/share'
import { formatScore } from '@/domain/vote'
import { countLabel } from '@/lib/format'
import { remoteImageUrl } from '@/lib/images'
import { cn } from '@/lib/utils'

import type { PublicResultRow } from '@/data-access/models'

/** Le code lu depuis l'URL, ou `notFound()` si le lien ne mène nulle part. */
async function requirePublicResults(code: string) {
  const parsed = parseResultsParam(code)
  if (!parsed) notFound()

  const results = await getPublicResults(parsed)
  if (!results) notFound()

  return { canonicalCode: parsed, results }
}

/**
 * Podium public d'une session close : `/r/7K3M9P2QWX`.
 *
 * Ce que la page montre est exactement ce que la RPC renvoie — le nom de la
 * session, combien de personnes ont voté, et les trois premiers. Pas de
 * pseudo, pas de détail de vote, pas de reste du classement : ce qui n'est
 * pas là ne peut pas fuiter.
 */
export async function PublicPodiumSection({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { canonicalCode, results } = await requirePublicResults(code)

  // Forme canonique : le code seul, en majuscules (saisie tolérante côté URL).
  const canonical = router.publicResults(canonicalCode)
  if (`/r/${code}` !== canonical) redirect(canonical)

  const [winner, ...rest] = results.podium
  if (!winner) notFound()

  return (
    <>
      <PageHeader
        eyebrow="Classement partagé"
        title={results.sessionName}
        description={`${countLabel(results.participantCount, 'participant')} ont tranché`}
      />

      <WinnerCard winner={winner} participantCount={results.participantCount} />

      {rest.length > 0 && (
        <section aria-label="Suite du podium" className="flex flex-col gap-2">
          <h2 className="font-display text-base font-semibold">Sur le podium aussi</h2>
          <ol className="flex flex-col gap-2">
            {rest.map((row) => (
              <li
                key={`${row.rank}-${row.restaurant_name}`}
                className="flex items-center gap-3 rounded-lg bg-surface p-4 ring-1 ring-line"
              >
                <span className="w-7 shrink-0 font-mono text-sm text-muted-foreground tabular">
                  {row.rank}.
                </span>
                <Thumbnail row={row} />
                <span className="min-w-0 flex-1 truncate font-semibold">{row.restaurant_name}</span>
                <span className="font-mono text-sm font-semibold text-muted-foreground tabular">
                  {formatScore(row.score)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="flex flex-col items-center gap-3 rounded-lg bg-surface-2 p-5 text-center">
        <RiTrophyLine aria-hidden="true" className="size-6 text-brand" />
        <p className="text-sm text-muted-foreground">
          Ce classement vient d’un vote de groupe. Le vôtre prend deux minutes, sans compte.
        </p>
        <Link href={router.home()} className={cn(buttonVariants())}>
          Lancer notre vote
        </Link>
      </section>
    </>
  )
}

function WinnerCard({
  winner,
  participantCount,
}: {
  winner: PublicResultRow
  participantCount: number
}) {
  const photo = remoteImageUrl(winner.photo_url)

  return (
    <section
      aria-labelledby="public-winner-title"
      className="relative flex flex-col gap-4 overflow-hidden rounded-xl chalkboard p-6"
    >
      {photo && (
        <div aria-hidden="true" className="absolute inset-0">
          <Image
            src={photo}
            alt=""
            fill
            sizes="(min-width: 1024px) 48rem, 100vw"
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-slate/70" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate to-transparent" />
        </div>
      )}

      <p className="relative font-mono text-[0.7rem] tracking-[0.12em] text-chalk-muted uppercase">
        On mange chez
      </p>
      <h2
        id="public-winner-title"
        className="relative font-display text-[2.4rem] leading-[1.02] font-extrabold tracking-[-0.03em] text-chalk sm:text-5xl"
      >
        {winner.restaurant_name}
      </h2>
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-chalk-muted">
        {winner.cuisine_type && <span className="uppercase">{winner.cuisine_type}</span>}
        <span className="font-mono tabular">
          Score {formatScore(winner.score)} · {winner.votes_count}/{participantCount} votes
        </span>
      </div>
      {winner.city && (
        <p className="relative flex items-start gap-1.5 text-sm text-chalk-muted">
          <RiMapPin2Line aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {winner.city}
        </p>
      )}
    </section>
  )
}

/** Vignette du podium. Rien n'est réservé quand la photo manque. */
function Thumbnail({ row }: { row: PublicResultRow }) {
  const photo = remoteImageUrl(row.photo_url)
  if (!photo) return null
  return (
    <Image
      src={photo}
      alt=""
      width={40}
      height={40}
      loading="lazy"
      className="size-10 shrink-0 rounded-md object-cover ring-1 ring-line"
    />
  )
}

/**
 * Silhouette du podium public. Le surtitre et l'appel à l'action ne dépendent
 * d'aucune donnée : ils s'affichent en clair, seuls le nom de la session et le
 * podium attendent la base.
 */
export function PublicPodiumFallback() {
  return (
    <>
      <PageHeaderFallback eyebrow="Classement partagé" description />
      <div aria-busy="true" className="flex flex-col gap-6">
        <Skeleton className="h-56 w-full rounded-xl" />
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-base font-semibold">Sur le podium aussi</h2>
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </section>
      </div>
    </>
  )
}
