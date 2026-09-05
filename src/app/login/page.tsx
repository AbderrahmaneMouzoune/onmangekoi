import { Suspense } from 'react'

import { LoginPanel, LoginPanelFallback } from '@/components/account/login-panel'
import { Brand } from '@/components/layout/brand'
import { Shell } from '@/components/layout/shell'
import { ThemeToggle } from '@/components/layout/theme-toggle'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Connexion' }

interface Props {
  searchParams: Promise<{ next?: string }>
}

export default function LoginPage({ searchParams }: Props) {
  return (
    <>
      <header className="mx-auto flex h-14 w-full max-w-lg items-center justify-between px-4">
        <Brand />
        <ThemeToggle />
      </header>
      <Shell className="justify-center gap-8">
        <Suspense fallback={<LoginPanelFallback />}>
          <LoginPanel searchParams={searchParams} />
        </Suspense>
      </Shell>
    </>
  )
}
