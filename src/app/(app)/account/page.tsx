import { Suspense } from 'react'

import { AccountDataSection } from '@/components/account/account-data-section'
import { AccountDetails, AccountDetailsFallback } from '@/components/account/account-details'
import { AccountGroupsSection } from '@/components/account/account-groups-section'
import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { router } from '@/config/router.config'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mon compte' }

interface Props {
  searchParams: Promise<{ auth?: string }>
}

export default function AccountPage({ searchParams }: Props) {
  return (
    <Shell>
      <PageHeader
        eyebrow="Compte"
        title="Mon compte"
        back={{ href: router.home(), label: 'Accueil' }}
      />

      <Suspense fallback={<AccountDetailsFallback />}>
        <AccountDetails searchParams={searchParams} />
      </Suspense>

      {/* Une personne sans groupe ne voit rien ici : rien à réserver non plus. */}
      <Suspense fallback={null}>
        <AccountGroupsSection />
      </Suspense>

      <AccountDataSection />
    </Shell>
  )
}
