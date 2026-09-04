import { RiRestaurant2Line } from '@remixicon/react'
import Link from 'next/link'

import { Shell } from '@/components/layout/shell'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

export default function NotFound() {
  return (
    <Shell className="justify-center">
      <EmptyState
        icon={<RiRestaurant2Line />}
        title="Cette page n’est pas au menu"
        description="Le lien est peut-être périmé, ou la session a été supprimée."
        action={
          <Link href="/" className={cn(buttonVariants())}>
            Retour à l’accueil
          </Link>
        }
      />
    </Shell>
  )
}
