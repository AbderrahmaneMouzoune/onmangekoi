import Link from 'next/link'

import { Brand } from '@/components/layout/brand'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Avatar } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { getProfile } from '@/data-access/profile'
import { createServerClient } from '@/data-access/supabase/server'
import { displayPseudo } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * En-tête de l'application. Server Component : lit l'utilisateur courant
 * (une requête, sous RLS) et affiche le pseudo ou l'entrée vers l'onboarding.
 */
export async function AppHeader() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const profile = user ? await getProfile(supabase, user.id) : null

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-between gap-3 px-4">
        <Brand />
        <nav aria-label="Compte" className="flex items-center gap-1">
          <ThemeToggle />
          {user ? (
            <Link
              href="/account"
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
              href="/setup"
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
