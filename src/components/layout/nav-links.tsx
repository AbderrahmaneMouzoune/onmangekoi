'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { router } from '@/config/router.config'
import { cn } from '@/lib/utils'

export const NAV_ITEMS = [
  { href: router.home(), label: 'Accueil', exact: true },
  { href: router.sessionNew(), label: 'Nouvelle session', exact: true },
  { href: router.join(), label: 'Rejoindre', exact: false },
  { href: router.lists(), label: 'Mes listes', exact: false },
] as const

function isCurrent(pathname: string, item: (typeof NAV_ITEMS)[number]): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

interface NavLinksProps {
  /** Sans chemin connu (silhouette du prérendu), aucun lien n'est marqué courant. */
  pathname?: string | null
  className?: string
}

/**
 * Liens de la navigation principale, marqués `aria-current` sur la page en
 * cours. Le chemin vient de `usePathname`, qui n'est pas connu au prérendu
 * d'une route dynamique : `NavLinks` lit le chemin, `StaticNavLinks` rend la
 * même liste sans le marquage pour la coquille statique.
 */
export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname()
  return <StaticNavLinks pathname={pathname} className={className} />
}

export function StaticNavLinks({ pathname = null, className }: NavLinksProps) {
  return (
    <ul className={cn('flex items-center gap-1', className)}>
      {NAV_ITEMS.map((item) => {
        const current = pathname !== null && isCurrent(pathname, item)
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors',
                current ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              )}
            >
              {item.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
