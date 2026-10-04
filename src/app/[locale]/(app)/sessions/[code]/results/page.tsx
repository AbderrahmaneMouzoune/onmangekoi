import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import {
  SessionResultsFallback,
  SessionResultsSection,
} from '@/components/session/session-results-section'
import { getSessionByParam } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ code }, supabase, t] = await Promise.all([
    params,
    createServerClient(),
    getTranslations('metadata.titles'),
  ])
  const session = await getSessionByParam(supabase, code).catch(() => null)
  return {
    title: session ? t('resultsOf', { name: session.name }) : t('results'),
    robots: { index: false },
  }
}

/** Classement : `/sessions/7K3M9P/results`. */
export default function ResultsPage({ params }: Props) {
  return (
    <Shell size="app">
      <Suspense fallback={<SessionResultsFallback />}>
        <SessionResultsSection params={params} />
      </Suspense>
    </Shell>
  )
}
