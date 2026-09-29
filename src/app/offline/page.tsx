import { RiWifiOffLine } from '@remixicon/react'

import { Brand } from '@/components/layout/brand'
import { Shell } from '@/components/layout/shell'
import { RetryButton } from '@/components/pwa/retry-button'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Hors ligne',
  robots: { index: false, follow: false },
}

/**
 * Page hors ligne (issue #11) : précachée par le service worker, servie
 * quand une navigation n'obtient pas de réponse du réseau. Entièrement
 * statique — elle ne lit rien, puisqu'elle doit s'afficher sans rien pouvoir
 * lire.
 */
export default function OfflinePage() {
  return (
    <>
      <header className="container-app flex h-14 items-center lg:h-16">
        <Brand />
      </header>
      <Shell className="justify-center">
        <section
          aria-labelledby="offline-title"
          className="flex flex-col items-center gap-4 rounded-xl chalkboard px-6 py-10 text-center shadow-lg lg:py-14"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-chalk/10 text-chalk">
            <RiWifiOffLine aria-hidden="true" className="size-7" />
          </span>
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[0.7rem] tracking-[0.12em] text-chalk-muted uppercase">
              Hors ligne
            </p>
            <h1 id="offline-title" className="font-display text-3xl font-bold text-chalk">
              Pas de réseau, pas de vote.
            </h1>
            <p className="mx-auto max-w-xs text-sm text-chalk-muted">
              Les sessions, les votes et le classement se jouent en direct avec le groupe. Dès que
              la connexion revient, la page se recharge d’elle-même.
            </p>
          </div>
          <RetryButton />
        </section>
      </Shell>
    </>
  )
}
