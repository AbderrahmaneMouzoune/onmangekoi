import Link from 'next/link'

import { Brand } from '@/components/layout/brand'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Avatar } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getProfile } from '@/data-access/profile'
import { createServerClient } from '@/data-access/supabase/server'
import { displayPseudo } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * En-tête de l'application. Server Component : l'utilisateur et le profil sont
 * mémoïsés par requête, donc partagés avec la page sans appel supplémentaire.
 */
export async function AppHeader() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  const profile = user ? await getProfile(supabase, user.id) : null

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-between gap-3 px-4">
        <Brand />
        <nav aria-label="Compte" className="flex items-center gap-1">
          <ThemeToggle />
          {user ? (
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
          ) : (
            <Link
              href={router.setup()}
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
            >
              Choisir un pseudo
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
