import { RiArrowRightLine, RiGroupLine, RiLinkM, RiRestaurant2Line } from '@remixicon/react'
import Link from 'next/link'

import { AppHeader } from '@/components/layout/app-header'
import { Shell } from '@/components/layout/shell'
import { SessionStatusBadge } from '@/components/session/session-status-badge'
import { buttonVariants } from '@/components/ui/button'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getListsByOwner } from '@/data-access/lists'
import { getMySessions } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { countLabel, relativeDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ListSummary, SessionSummary } from '@/data-access/models'

const STEPS = [
  {
    icon: RiRestaurant2Line,
    title: 'Choisis les restos',
    text: 'Pioche dans la base ou dans une de tes listes de favoris.',
  },
  {
    icon: RiLinkM,
    title: 'Partage le lien',
    text: 'Un code à dire à voix haute, un QR code à montrer, ou un lien à coller.',
  },
  {
    icon: RiGroupLine,
    title: 'Chacun vote, le classement tombe',
    text: 'Bof, ça me va, coup de cœur ou veto. Quand tout le monde a voté, c’est réglé.',
  },
] as const

export default async function HomePage() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])

  const [sessions, lists] = user
    ? await Promise.all([getMySessions(supabase), getListsByOwner(supabase, user.id)])
    : [[] as SessionSummary[], [] as ListSummary[]]

  return (
    <>
      <AppHeader />
      <Shell className="gap-10">
        <section className="flex flex-col gap-6 pt-4">
          <div className="flex flex-col gap-3">
            <p className="eyebrow">Vote de groupe · 2 minutes</p>
            <h1 className="text-4xl font-extrabold sm:text-5xl">
              Où est-ce qu’on <span className="text-brand">mange</span> ?
            </h1>
            <p className="max-w-md text-base text-ink-2">
              Fini le « comme tu veux ». Le groupe vote restaurant par restaurant, le classement
              tranche. Sans créer de compte.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={router.sessionNew()}
              className={cn(buttonVariants({ size: 'lg' }), 'sm:flex-1')}
            >
              Créer une session
              <RiArrowRightLine aria-hidden="true" />
            </Link>
            <Link
              href={router.join()}
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'sm:flex-1')}
            >
              J’ai un code
            </Link>
          </div>
        </section>

        {user && sessions.length > 0 && (
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

        {user && (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold">Tes listes</h2>
              <Link
                href={router.lists()}
                className="text-sm font-medium text-brand hover:underline"
              >
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
        )}

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">Comment ça marche</h2>
          <ol className="flex flex-col gap-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="flex gap-4 rounded-lg bg-surface p-4 ring-1 ring-line"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate text-chalk">
                  <step.icon aria-hidden="true" className="size-5" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="font-display font-semibold">
                    <span className="mr-2 font-mono text-xs text-muted-foreground tabular">
                      0{index + 1}
                    </span>
                    {step.title}
                  </p>
                  <p className="text-sm text-muted-foreground">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </Shell>
    </>
  )
}
