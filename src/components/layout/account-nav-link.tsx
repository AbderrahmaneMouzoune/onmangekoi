import Link from 'next/link'

import { Avatar } from '@/components/ui/avatar'
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
 * supplémentaire.
 */
export async function AccountNavLink() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  const profile = user ? await getProfile(supabase, user.id) : null

  if (!user) {
    return (
      <Link
        href={router.setup()}
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
      >
        Choisir un pseudo
      </Link>
    )
  }

  return (
    <Link
      href={router.account()}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'sm' }),
        'gap-2 rounded-full pr-3 pl-1'
      )}
    >
      <Avatar name={profile?.pseudo} size="sm" />
      <span className="max-w-28 truncate">{displayPseudo(profile?.pseudo)}</span>
    </Link>
  )
}
