import { RiErrorWarningLine } from '@remixicon/react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Shell } from '@/components/layout/shell'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { getSessionPreview } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/lib/errors'
import { displayPseudo } from '@/lib/format'
import { setupHref } from '@/lib/routing'
import { cn } from '@/lib/utils'
import { joinSessionUseCase } from '@/use-cases/join-session'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const supabase = await createServerClient()
  const preview = await getSessionPreview(supabase, token).catch(() => null)

  if (!preview) return { title: 'Invitation' }

  const host = displayPseudo(preview.host_pseudo)
  return {
    title: `Rejoins « ${preview.name} »`,
    description: `${host} t’invite à choisir où manger. Vote en deux minutes, sans compte.`,
    openGraph: {
      title: `${host} t’invite : ${preview.name}`,
      description: 'Vote sur les restos, le classement tranche.',
    },
  }
}

/**
 * Join direct par lien : idempotent. Si l'utilisateur n'a pas encore de pseudo,
 * le proxy l'a envoyé sur /setup avec ce chemin en `next`, et il revient ici.
 */
export default async function JoinByTokenPage({ params }: Props) {
  const { token } = await params
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(setupHref(`/join/${token}`))

  let sessionId: string | null = null
  let errorMessage: string | null = null
  try {
    const session = await joinSessionUseCase(supabase, token)
    sessionId = session.id
  } catch (error) {
    errorMessage = toUserMessage(error, 'Lien invalide ou session introuvable.')
  }

  if (sessionId) redirect(`/sessions/${sessionId}`)

  const preview = await getSessionPreview(supabase, token).catch(() => null)

  return (
    <Shell className="justify-center">
      <EmptyState
        icon={<RiErrorWarningLine />}
        title={preview ? `Impossible de rejoindre « ${preview.name} »` : 'Impossible de rejoindre'}
        description={errorMessage ?? undefined}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/join" className={cn(buttonVariants({ variant: 'outline' }))}>
              Entrer un code
            </Link>
            <Link href="/" className={cn(buttonVariants())}>
              Accueil
            </Link>
          </div>
        }
      />
    </Shell>
  )
}
