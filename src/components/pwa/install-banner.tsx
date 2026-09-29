'use client'

import { RiDownload2Line } from '@remixicon/react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { useAnalyticsConsent } from '@/hooks/use-analytics-consent'
import { useInstallOffer } from '@/hooks/use-install-offer'

/**
 * « Installer l'app » : proposée après une première session réussie, quand
 * le navigateur sait installer (voir `lib/pwa/install-offer.ts`). Montée sur
 * l'accueil seulement — c'est là qu'on revient le lendemain, et elle ne
 * recouvre ainsi jamais le deck ni le classement.
 *
 * Elle s'efface derrière le bandeau de consentement : une question à la fois.
 */
export function InstallBanner() {
  const t = useTranslations('pwa.install')
  const { visible, install, dismiss } = useInstallOffer()
  const consent = useAnalyticsConsent()

  if (!visible || (consent.available && consent.choice === 'unset')) return null

  return (
    <section
      aria-labelledby="install-title"
      className="fixed inset-x-0 bottom-0 z-40 chalkboard px-4 py-4 safe-bottom shadow-lg lg:inset-x-auto lg:right-6 lg:bottom-6 lg:max-w-md lg:rounded-xl lg:p-5"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-chalk/10 text-chalk">
            <RiDownload2Line aria-hidden="true" className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="install-title" className="font-display text-base font-semibold text-chalk">
              {t('title')}
            </h2>
            <p className="text-sm text-chalk-muted">{t('description')}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-chalk hover:bg-chalk/10 hover:text-chalk"
            onClick={dismiss}
          >
            {t('later')}
          </Button>
          <Button type="button" onClick={() => void install()}>
            {t('install')}
          </Button>
        </div>
      </div>
    </section>
  )
}
