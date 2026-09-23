import Link from 'next/link'

import { AccountMenu } from '@/components/layout/account-menu'
import { VisitMemo } from '@/components/layout/visit-memo'
import { buttonVariants } from '@/components/ui/button'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getProfile } from '@/data-access/profile'
import { createServerClient } from '@/data-access/supabase/server'
import { displayPseudo } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Bloc compte de l'en-tête : la seule partie personnalisée. L'utilisateur et
 * le profil sont mémoïsés par requête, donc partagés avec la page sans appel
 * supplémentaire. Présent sur toutes les pages, c'est aussi lui qui note —
 * ou oublie, à la déconnexion — qu'un pseudo existe, pour les silhouettes.
 */
export async function AccountNavLink() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  const profile = user ? await getProfile(supabase, user.id) : null

  if (!user) {
    return (
      <>
        <VisitMemo account={false} />
        <ChoosePseudoLink />
      </>
    )
  }

  return (
    <>
      <VisitMemo account />
      <AccountMenu
        pseudo={displayPseudo(profile?.pseudo)}
        isAnonymous={Boolean(user.is_anonymous)}
      />
    </>
  )
}

/** Bouton des visiteurs sans pseudo — partagé avec la silhouette de l'en-tête. */
export function ChoosePseudoLink({ className }: { className?: string }) {
  return (
    <Link
      href={router.setup()}
      className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), className)}
    >
      Choisir un pseudo
    </Link>
  )
}
