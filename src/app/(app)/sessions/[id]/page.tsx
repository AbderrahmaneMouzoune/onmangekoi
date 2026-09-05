import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import { SessionRoomFallback, SessionRoomSection } from '@/components/session/session-room-section'
import { getSessionById } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { SessionIdSchema } from '@/lib/schemas/session'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, supabase] = await Promise.all([params, createServerClient()])
  if (!SessionIdSchema.safeParse(id).success) return { title: 'Session' }
  const session = await getSessionById(supabase, id).catch(() => null)
  return { title: session?.name ?? 'Session', robots: { index: false } }
}

export default function SessionPage({ params }: Props) {
  return (
    <Shell>
      <Suspense fallback={<SessionRoomFallback />}>
        <SessionRoomSection params={params} />
      </Suspense>
    </Shell>
  )
}
