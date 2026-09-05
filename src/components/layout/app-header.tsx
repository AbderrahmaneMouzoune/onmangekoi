import { Suspense } from 'react'

import { Brand } from '@/components/layout/brand'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Skeleton } from '@/components/ui/skeleton'

import { AccountNavLink } from './account-nav-link'

/**
 * En-tête de l'application.
 *
 * La barre elle-même (marque, bascule de thème) ne dépend de personne : elle
 * fait partie de la coquille statique prérendue et s'affiche immédiatement.
 * Seul le bloc compte lit les cookies, il est donc isolé dans son `<Suspense>`
 * et diffusé en streaming — sans quoi l'en-tête rendrait *toutes* les pages
 * dynamiques, y compris celles qui n'ont aucune donnée personnelle.
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-between gap-3 px-4">
        <Brand />
        <nav aria-label="Compte" className="flex items-center gap-1">
          <ThemeToggle />
          <Suspense fallback={<Skeleton className="h-8 w-28 rounded-full" />}>
            <AccountNavLink />
          </Suspense>
        </nav>
      </div>
    </header>
  )
}
