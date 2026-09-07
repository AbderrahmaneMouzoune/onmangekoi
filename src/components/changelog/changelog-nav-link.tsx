'use client'

import { RiSparkling2Line } from '@remixicon/react'
import Link from 'next/link'
import { useEffect, useSyncExternalStore } from 'react'

import { buttonVariants } from '@/components/ui/button'
import { router } from '@/config/router.config'
import { LATEST_RELEASE_VERSION } from '@/content/changelog'
import { hasUnreadRelease, initSeenRelease, readSeenRelease } from '@/lib/changelog-seen'
import { cn } from '@/lib/utils'

/** Le repère ne change pas tout seul : rien à écouter, rien à désabonner. */
const subscribe = () => () => {}

/** Au rendu serveur et à l'hydratation, on ne sait rien — donc pas de pastille. */
const unknown = () => null

/**
 * Accès aux nouveautés depuis l'en-tête, avec une pastille quand une version
 * est parue depuis la dernière visite.
 *
 * L'en-tête fait partie de la coquille prérendue : le lien est donc rendu
 * identique pour tout le monde, et la pastille n'apparaît qu'une fois le
 * repère lu dans le navigateur. Un premier visiteur ne voit rien — tout lui est
 * nouveau — mais son repère est posé pour la prochaine version.
 */
export function ChangelogNavLink() {
  const seen = useSyncExternalStore(subscribe, readSeenRelease, unknown)
  const unread = hasUnreadRelease(LATEST_RELEASE_VERSION, seen)

  useEffect(() => {
    if (LATEST_RELEASE_VERSION) initSeenRelease(LATEST_RELEASE_VERSION)
  }, [])

  return (
    <Link
      href={router.changelog()}
      aria-label={unread ? 'Nouveautés — une version non lue' : 'Nouveautés'}
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'relative')}
    >
      <RiSparkling2Line aria-hidden="true" />
      {unread && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand ring-2 ring-background"
        />
      )}
    </Link>
  )
}
