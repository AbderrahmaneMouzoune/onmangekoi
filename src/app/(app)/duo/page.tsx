import { Suspense } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { DuoCreateSection, DuoCreateSectionFallback } from '@/components/session/duo-create-section'
import { router } from '@/config/router.config'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'À deux',
  description:
    'Décider à deux où manger : un lien à envoyer, les mêmes restos à balayer, et le premier « ça me va » commun tranche.',
}

/**
 * Mode duo (#61) : choisir les restos, puis envoyer un lien — pas de code à
 * dicter, pas de salle d'attente. La session part aussitôt en vote ; l'écran
 * « Envoie ce lien » est la salle de session elle-même, deck en dessous.
 */
export default function DuoPage() {
  return (
    <Shell size="app">
      <PageHeader
        eyebrow="À deux"
        title="On décide à deux ?"
        description="Choisis quelques restos, envoie le lien. Vous balayez les mêmes : au premier « ça me va » commun, c’est décidé."
        back={{ href: router.home(), label: 'Accueil' }}
      />
      <Suspense fallback={<DuoCreateSectionFallback />}>
        <DuoCreateSection />
      </Suspense>
    </Shell>
  )
}
