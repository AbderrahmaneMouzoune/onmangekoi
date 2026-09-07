import { Suspense } from 'react'

import { Brand } from '@/components/layout/brand'
import { Shell } from '@/components/layout/shell'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { SetupPanel, SetupPanelFallback } from '@/components/onboarding/setup-panel'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Choisir un pseudo' }

interface Props {
  searchParams: Promise<{ next?: string }>
}

export default function SetupPage({ searchParams }: Props) {
  return (
    <>
      <header className="container-app flex h-14 items-center justify-between lg:h-16">
        <Brand />
        <ThemeToggle />
      </header>
      <Shell className="justify-center gap-8">
        <Suspense fallback={<SetupPanelFallback />}>
          <SetupPanel searchParams={searchParams} />
        </Suspense>
      </Shell>
    </>
  )
}
