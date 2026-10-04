'use client'

import { RiMoonLine, RiSunLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import { useIsClient } from '@/hooks/use-is-client'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isClient = useIsClient()
  const t = useTranslations('layout.theme')

  const isDark = isClient && resolvedTheme === 'dark'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={isDark ? t('toLight') : t('toDark')}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <RiSunLine aria-hidden="true" /> : <RiMoonLine aria-hidden="true" />}
    </Button>
  )
}
