import { Suspense } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import {
  CreateSessionSection,
  CreateSessionSectionFallback,
} from '@/components/session/create-session-section'
import { router } from '@/config/router.config'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Nouvelle session' }

export default function NewSessionPage() {
  return (
    <Shell>
      <PageHeader
        eyebrow="Nouvelle session"
        title="Qui décide ce midi ?"
        description="Choisis les restos à départager, puis invite le groupe."
        back={{ href: router.home(), label: 'Accueil' }}
      />
      <Suspense fallback={<CreateSessionSectionFallback />}>
        <CreateSessionSection />
      </Suspense>
    </Shell>
  )
}
