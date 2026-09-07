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
 *
 * Sur téléphone, l'ordre du document : accroche, tableau de bord, « comment ça
 * marche ». Sur grand écran, l'accroche et « comment ça marche » se font face
 * — la page a toujours deux colonnes à montrer, même à qui n'a encore ni
 * session ni liste — et le tableau de bord vient dessous, sur toute la
 * largeur. Le placement est fait en grille, sans toucher à l'ordre du DOM.
 */
export default function HomePage() {
  return (
    <>
      <AppHeader />
      <Shell size="app" className="gap-10 lg:gap-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-x-16 lg:gap-y-14">
          <section className="flex flex-col gap-6 self-center pt-4 lg:col-start-1 lg:row-start-1 lg:pt-0">
            <div className="flex flex-col gap-3 lg:gap-4">
              <p className="eyebrow">Vote de groupe · 2 minutes</p>
              <h1 className="text-4xl font-extrabold sm:text-5xl lg:text-6xl">
                Où est-ce qu’on <span className="text-brand">mange</span> ?
              </h1>
              <p className="max-w-md text-base text-ink-2 lg:max-w-lg lg:text-lg">
                Fini le « comme tu veux ». Le groupe vote restaurant par restaurant, le classement
                tranche. Sans créer de compte.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:max-w-lg">
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

          <div className="empty:hidden lg:col-span-2 lg:row-start-2">
            <Suspense fallback={<HomeDashboardFallback />}>
              <HomeDashboard />
            </Suspense>
          </div>

          <section
            aria-labelledby="how-title"
            className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1"
          >
            <h2 id="how-title" className="text-lg font-bold">
              Comment ça marche
            </h2>
            <ol className="flex flex-col gap-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="flex gap-4 rounded-lg bg-surface p-4 ring-1 ring-line lg:p-5"
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
        </div>
      </Shell>
      <SiteFooter />
    </>
  )
}
