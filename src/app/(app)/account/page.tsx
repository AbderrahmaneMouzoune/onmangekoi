import { Suspense } from 'react'

import { AccountDataSection } from '@/components/account/account-data-section'
import { AccountDetails, AccountDetailsFallback } from '@/components/account/account-details'
import { AccountGroupsSection } from '@/components/account/account-groups-section'
import { AccountStats, AccountStatsFallback } from '@/components/account/account-stats'
import { AnalyticsPreference } from '@/components/analytics/analytics-preference'
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
    <Shell size="app">
      <PageHeader
        eyebrow="Compte"
        title="Mon compte"
        back={{ href: router.home(), label: 'Accueil' }}
      />

      {/* Sur grand écran : l'identité, le compte et les groupes à gauche, les
          réglages qui ne dépendent de personne — mesure d'usage, données — à
          droite. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="flex flex-col gap-6">
          <Suspense fallback={<AccountDetailsFallback />}>
            <AccountDetails searchParams={searchParams} />
          </Suspense>

          <Suspense fallback={<AccountStatsFallback />}>
            <AccountStats />
          </Suspense>

          {/* Une personne sans groupe ne voit rien ici : rien à réserver non plus. */}
          <Suspense fallback={null}>
            <AccountGroupsSection />
          </Suspense>
        </div>
        <div className="flex flex-col gap-6">
          <AnalyticsPreference />
          <AccountDataSection />
        </div>
      </div>
    </Shell>
  )
}
