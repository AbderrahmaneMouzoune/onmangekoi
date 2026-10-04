'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useTransition } from 'react'

import { setLocaleAction } from '@/actions/locale'
import { LOCALE_LABELS, LOCALES, type Locale } from '@/i18n/config'
import { cn } from '@/lib/utils'

/**
 * Sélecteur de langue du pied de page : deux boutons, la langue courante
 * marquée. Chaque bouton porte le nom de sa langue *dans* cette langue
 * (« English », « Français ») et son attribut `lang` : c'est ainsi qu'on
 * reconnaît la sienne, et qu'un lecteur d'écran la prononce.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const current = useLocale()
  const t = useTranslations('layout.locale')
  const [isPending, startTransition] = useTransition()

  function choose(locale: Locale) {
    if (locale === current) return
    startTransition(async () => {
      const result = await setLocaleAction(locale)
      // Recharger repasse par le proxy, qui lit le cookie tout juste posé.
      if (result.ok) window.location.reload()
    })
  }

  return (
    <span role="group" aria-label={t('label')} className={cn('flex items-center gap-1', className)}>
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-label={LOCALE_LABELS[locale]}
          aria-pressed={locale === current}
          disabled={isPending}
          onClick={() => choose(locale)}
          className={cn(
            'rounded-sm px-1 font-medium uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60',
            locale === current ? 'text-ink' : 'hover:text-ink'
          )}
        >
          {locale}
        </button>
      ))}
    </span>
  )
}
