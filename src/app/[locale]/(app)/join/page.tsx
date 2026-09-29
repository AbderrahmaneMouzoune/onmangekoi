import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { JoinForm } from '@/components/session/join-form'
import { router } from '@/config/router.config'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Rejoindre une session' }

export default function JoinPage() {
  return (
    <Shell>
      <PageHeader
        eyebrow="Rejoindre"
        title="Scanne ou entre le code"
        description="Le host te montre son QR code, te dit le code, ou t’envoie le lien."
        back={{ href: router.home(), label: 'Accueil' }}
      />
      <JoinForm />
    </Shell>
  )
}
