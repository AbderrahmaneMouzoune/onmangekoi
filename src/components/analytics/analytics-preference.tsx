'use client'

import { RiBarChartLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { useAnalyticsConsent } from '@/hooks/use-analytics-consent'
import { useIsClient } from '@/hooks/use-is-client'

/**
 * Réglage du consentement depuis « Mon compte » : retirer son accord doit être
 * aussi simple que le donner. Invisible si la mesure n'est pas configurée sur
 * ce déploiement.
 */
export function AnalyticsPreference() {
  const t = useTranslations('account.analytics')
  const isClient = useIsClient()
  const { choice, available, accept, refuse } = useAnalyticsConsent()

  if (!isClient || !available) return null

  const granted = choice === 'granted'

  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <RiBarChartLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{granted ? t('on') : t('off')}</p>
      </div>
      <Button
        type="button"
        variant={granted ? 'outline' : 'default'}
        className="self-start"
        onClick={granted ? refuse : accept}
      >
        {granted ? t('disable') : t('enable')}
      </Button>
    </section>
  )
}
