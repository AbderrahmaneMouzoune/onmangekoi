import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import { JoinByToken, JoinByTokenFallback } from '@/components/session/join-by-token'
import { getSessionPreview } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { displayPseudo } from '@/lib/format'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ token }, supabase] = await Promise.all([params, createServerClient()])
  const preview = await getSessionPreview(supabase, decodeURIComponent(token)).catch(() => null)

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
 * Join direct par lien, code ou QR : idempotent. Sans pseudo, le proxy a
 * envoyé l'invité sur /setup avec ce chemin en `next`, et il revient ici.
 */
export default function JoinByTokenPage({ params }: Props) {
  return (
    <Shell className="justify-center">
      <Suspense fallback={<JoinByTokenFallback />}>
        <JoinByToken params={params} />
      </Suspense>
    </Shell>
  )
}
