import { RiErrorWarningLine } from '@remixicon/react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Shell } from '@/components/layout/shell'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getSessionPreview } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/lib/errors'
import { displayPseudo } from '@/lib/format'
import { parseInviteIdentifier } from '@/lib/share'
import { cn } from '@/lib/utils'
import { joinSessionUseCase } from '@/use-cases/join-session'

import type { Session } from '@/data-access/models'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ invite: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ invite }, supabase] = await Promise.all([params, createServerClient()])
  const identifier = parseInviteIdentifier(invite)
  const preview =
    identifier.kind === 'invalid'
      ? null
      : await getSessionPreview(supabase, identifier.value).catch(() => null)

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
 * Join direct par lien (`/join/dej-du-lundi-7K3M9P`), code ou QR : idempotent.
 * Sans pseudo, le proxy a envoyé l'invité sur /setup avec ce chemin en `next`,
 * et il revient ici. Les anciens liens à jeton long restent acceptés.
 */
export default async function JoinByInvitePage({ params }: Props) {
  const [{ invite }, supabase, user] = await Promise.all([
    params,
    createServerClient(),
    getCurrentUser(),
  ])
  if (!user) redirect(router.setup(router.joinInvite(invite)))

  const identifier = parseInviteIdentifier(invite)

  let session: Session | null = null
  let errorMessage: string | null = null
  try {
    session = await joinSessionUseCase(supabase, invite)
  } catch (error) {
    errorMessage = toUserMessage(error, 'Lien invalide ou session introuvable.')
  }

  if (session) redirect(router.session(session))

  const preview =
    identifier.kind === 'invalid'
      ? null
      : await getSessionPreview(supabase, identifier.value).catch(() => null)

  return (
    <Shell className="justify-center">
      <EmptyState
        icon={<RiErrorWarningLine />}
        title={preview ? `Impossible de rejoindre « ${preview.name} »` : 'Impossible de rejoindre'}
        description={errorMessage ?? undefined}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={router.join()} className={cn(buttonVariants({ variant: 'outline' }))}>
              Entrer un code
            </Link>
            <Link href={router.home()} className={cn(buttonVariants())}>
              Accueil
            </Link>
          </div>
        }
      />
    </Shell>
  )
}
