import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Brand } from '@/components/layout/brand'
import { Shell } from '@/components/layout/shell'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { PseudoForm } from '@/components/onboarding/pseudo-form'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getSessionPreview } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { countLabel, displayPseudo } from '@/lib/format'
import { sanitizeNextPath } from '@/lib/routing'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Choisir un pseudo' }

interface Props {
  searchParams: Promise<{ next?: string }>
}

const JOIN_PATH = /^\/join\/([^/?#]+)(?:[?#].*)?$/

export default async function SetupPage({ searchParams }: Props) {
  const { next: rawNext } = await searchParams
  const next = sanitizeNextPath(rawNext, router.home())
  const inviteIdentifier = next.match(JOIN_PATH)?.[1]

  // L'utilisateur et l'aperçu d'invitation sont indépendants : en parallèle.
  // L'aperçu est décoratif, une erreur réseau ne doit pas bloquer l'onboarding.
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  const preview = inviteIdentifier
    ? await getSessionPreview(supabase, decodeURIComponent(inviteIdentifier)).catch(() => null)
    : null

  if (user) redirect(next)

  return (
    <>
      <header className="mx-auto flex h-14 w-full max-w-lg items-center justify-between px-4">
        <Brand />
        <ThemeToggle />
      </header>
      <Shell className="justify-center gap-8">
        {preview ? (
          <div className="flex flex-col gap-3 rounded-lg chalkboard p-5 text-chalk">
            <p className="font-mono text-[0.7rem] tracking-[0.12em] text-chalk-muted uppercase">
              Invitation
            </p>
            <p className="font-display text-2xl leading-tight font-bold">{preview.name}</p>
            <p className="text-sm text-chalk-muted">
              {displayPseudo(preview.host_pseudo)} t’invite ·{' '}
              {countLabel(preview.restaurant_count, 'resto')} ·{' '}
              {countLabel(preview.participant_count, 'participant')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="eyebrow">Première visite</p>
            <h1 className="text-3xl font-extrabold">Un pseudo, et c’est tout.</h1>
            <p className="text-sm text-ink-2">
              Pas de compte à créer. Tu pourras en lier un plus tard pour retrouver tes listes
              ailleurs.
            </p>
          </div>
        )}

        {preview && <h1 className="text-2xl font-bold">Comment veux-tu qu’on t’appelle ?</h1>}

        <PseudoForm
          next={next !== router.home() ? next : undefined}
          submitLabel={preview ? 'Rejoindre' : undefined}
        />

        <p className="text-center text-sm text-muted-foreground">
          Déjà un compte ?{' '}
          <Link href={router.login(next)} className="font-medium text-brand hover:underline">
            Se connecter
          </Link>
        </p>
      </Shell>
    </>
  )
}
