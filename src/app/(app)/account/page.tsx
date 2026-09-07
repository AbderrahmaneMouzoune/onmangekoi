import { Suspense } from 'react'

import { AccountDataSection } from '@/components/account/account-data-section'
import { AccountDetails, AccountDetailsFallback } from '@/components/account/account-details'
import { AccountStats, AccountStatsFallback } from '@/components/account/account-stats'
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

      <Suspense fallback={<AccountStatsFallback />}>
        <AccountStats />
      </Suspense>

      <AccountDataSection />
    </Shell>
  )
}
