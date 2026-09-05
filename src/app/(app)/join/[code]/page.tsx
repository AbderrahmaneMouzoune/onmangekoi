import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import { JoinByCode, JoinByCodeFallback } from '@/components/session/join-by-code'
import { getSessionPreview } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { parseInviteIdentifier } from '@/domain/share'
import { displayPseudo } from '@/lib/format'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ code }, supabase] = await Promise.all([params, createServerClient()])
  const identifier = parseInviteIdentifier(code)
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
 * Join direct par lien (`/join/7K3M9P`), code ou QR : idempotent. Sans pseudo,
 * le proxy a envoyé l'invité sur /setup avec ce chemin en `next`, et il revient
 * ici. Les anciens liens à jeton long restent acceptés.
 */
export default function JoinByCodePage({ params }: Props) {
  return (
    <Shell className="justify-center">
      <Suspense fallback={<JoinByCodeFallback />}>
        <JoinByCode params={params} />
      </Suspense>
    </Shell>
  )
}
