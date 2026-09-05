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
      <header className="mx-auto flex h-14 w-full max-w-lg items-center justify-between px-4">
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
