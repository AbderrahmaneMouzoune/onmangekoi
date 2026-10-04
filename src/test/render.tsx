import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { DEFAULT_LOCALE, TIME_ZONE, type Locale } from '@/i18n/config'
import { MESSAGES } from '@/i18n/messages'

interface IntlRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Français par défaut : les tests cherchent les textes tels que l'équipe les lit. */
  locale?: Locale
}

/**
 * `render` de Testing Library, sous le même `NextIntlClientProvider` que le
 * layout racine : les composants traduits (`useTranslations`, `useLocale`)
 * s'y rendent avec les vrais messages de `messages/<langue>/`.
 */
export function renderWithIntl(
  ui: React.ReactElement,
  { locale = DEFAULT_LOCALE, ...options }: IntlRenderOptions = {}
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone={TIME_ZONE}>
        {children}
      </NextIntlClientProvider>
    ),
    ...options,
  })
}
