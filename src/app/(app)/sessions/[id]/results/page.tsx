import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import {
  SessionResultsFallback,
  SessionResultsSection,
} from '@/components/session/session-results-section'
import { getSessionById } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { SessionIdSchema } from '@/lib/schemas/session'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, supabase] = await Promise.all([params, createServerClient()])
  if (!SessionIdSchema.safeParse(id).success) return { title: 'Classement' }
  const session = await getSessionById(supabase, id).catch(() => null)
  return {
    title: session ? `Classement · ${session.name}` : 'Classement',
    robots: { index: false },
  }
}

export default function ResultsPage({ params }: Props) {
  return (
    <Shell wide>
      <Suspense fallback={<SessionResultsFallback />}>
        <SessionResultsSection params={params} />
      </Suspense>
    </Shell>
  )
}
