import { RiArrowRightLine, RiGroupLine, RiLinkM, RiRestaurant2Line } from '@remixicon/react'
import Link from 'next/link'
import { Suspense } from 'react'

import { HomeDashboard, HomeDashboardFallback } from '@/components/home/home-dashboard'
import { AppHeader } from '@/components/layout/app-header'
import { Shell } from '@/components/layout/shell'
import { SiteFooter } from '@/components/layout/site-footer'
import { buttonVariants } from '@/components/ui/button'
import { router } from '@/config/router.config'
import { cn } from '@/lib/utils'

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

/**
 * Accueil : tout est statique sauf le bloc « tes sessions / tes listes », qui
 * arrive en streaming. La page est donc prérendue et servie depuis le cache,
 * y compris pour un premier visiteur.
 */
export default function HomePage() {
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

        <Suspense fallback={<HomeDashboardFallback />}>
          <HomeDashboard />
        </Suspense>

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
      <SiteFooter />
    </>
  )
}
