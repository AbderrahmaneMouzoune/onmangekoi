import Link from 'next/link'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/components/account/login-form'
import { Brand } from '@/components/layout/brand'
import { Shell } from '@/components/layout/shell'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { sanitizeNextPath } from '@/lib/routing'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Connexion' }

interface Props {
  searchParams: Promise<{ next?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const [{ next: rawNext }, user] = await Promise.all([searchParams, getCurrentUser()])
  const next = sanitizeNextPath(rawNext, router.home())
  if (user && !user.is_anonymous) redirect(next)

  return (
    <>
      <header className="mx-auto flex h-14 w-full max-w-lg items-center justify-between px-4">
        <Brand />
        <ThemeToggle />
      </header>
      <Shell className="justify-center gap-8">
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
      </Shell>
    </>
  )
}
