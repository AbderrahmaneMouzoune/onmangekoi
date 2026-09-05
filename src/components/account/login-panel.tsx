import Link from 'next/link'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/components/account/login-form'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { sanitizeNextPath } from '@/lib/routing'

/** Formulaire de connexion : dépend de `?next=` et de la session en cours. */
export async function LoginPanel({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next: rawNext }, user] = await Promise.all([searchParams, getCurrentUser()])
  const next = sanitizeNextPath(rawNext, router.home())
  if (user && !user.is_anonymous) redirect(next)

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="eyebrow">Compte</p>
        <h1 className="text-3xl font-extrabold">Retrouver mes listes</h1>
        <p className="text-sm text-ink-2">
          Connecte-toi avec l’email et le mot de passe définis depuis ton autre appareil.
        </p>
      </div>

      <LoginForm next={next !== router.home() ? next : undefined} />

      <p className="text-center text-sm text-muted-foreground">
        Pas de compte ? Il n’en faut pas :{' '}
        <Link href={router.setup(next)} className="font-medium text-brand hover:underline">
          choisis juste un pseudo
        </Link>
        .
      </p>
    </>
  )
}

export function LoginPanelFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
      </div>
    </div>
  )
}
