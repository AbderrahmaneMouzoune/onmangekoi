import { Suspense } from 'react'

import { Brand } from '@/components/layout/brand'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Skeleton } from '@/components/ui/skeleton'

import { AccountNavLink, ChoosePseudoLink } from './account-nav-link'

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
          <Suspense fallback={<AccountNavFallback />}>
            <AccountNavLink />
          </Suspense>
        </nav>
      </div>
    </header>
  )
}

/**
 * Silhouette du bloc compte, accordée à la dernière visite : à qui n'a jamais
 * choisi de pseudo, on montre directement le bouton qu'il va voir ; à qui
 * revient, la pastille de son compte aux dimensions du vrai lien.
 */
function AccountNavFallback() {
  return (
    <>
      <ChoosePseudoLink className="seen-account:hidden" />
      <div
        aria-busy="true"
        className="hidden h-9 items-center gap-2 rounded-full pr-3 pl-1 seen-account:flex"
      >
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-4 w-20" />
      </div>
    </>
  )
}
