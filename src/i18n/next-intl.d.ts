import type { Locale } from './config'
import type { AppMessages } from './messages'

/**
 * Typage global de `next-intl` : `t('clé')`, `useTranslations('espace')` et
 * `getTranslations('espace')` sont vérifiés au typecheck contre les messages
 * français, et `useLocale()` renvoie `'fr' | 'en'`.
 */
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: AppMessages
  }
}
