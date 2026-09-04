'use client'

import { RiMoonLine, RiSunLine } from '@remixicon/react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import { useIsClient } from '@/hooks/use-is-client'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isClient = useIsClient()

  const isDark = isClient && resolvedTheme === 'dark'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <RiSunLine aria-hidden="true" /> : <RiMoonLine aria-hidden="true" />}
    </Button>
  )
}
