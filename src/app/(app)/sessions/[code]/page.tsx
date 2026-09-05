import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import { SessionRoomFallback, SessionRoomSection } from '@/components/session/session-room-section'
import { getSessionByParam } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ code }, supabase] = await Promise.all([params, createServerClient()])
  const session = await getSessionByParam(supabase, code).catch(() => null)
  return { title: session?.name ?? 'Session', robots: { index: false } }
}

/**
 * Salle de session : `/sessions/7K3M9P` — le code d'invitation, celui qu'on se
 * dit à voix haute. Les anciens liens en uuid restent valides et sont
 * redirigés vers cette forme.
 */
export default function SessionPage({ params }: Props) {
  return (
    <Shell>
      <Suspense fallback={<SessionRoomFallback />}>
        <SessionRoomSection params={params} />
      </Suspense>
    </Shell>
  )
}
