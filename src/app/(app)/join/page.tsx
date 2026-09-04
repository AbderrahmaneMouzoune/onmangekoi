import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { JoinForm } from '@/components/session/join-form'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Rejoindre une session' }

export default function JoinPage() {
  return (
    <Shell>
      <PageHeader
        eyebrow="Rejoindre"
        title="Entre le code"
        description="Le host te l’a dit à voix haute ou envoyé en lien."
        back={{ href: '/', label: 'Accueil' }}
      />
      <JoinForm />
    </Shell>
  )
}
