'use client'

import { createTranslator } from 'next-intl'

import { useIsClient } from '@/hooks/use-is-client'
import { readClientLocale } from '@/i18n/client-locale'
import { DEFAULT_LOCALE } from '@/i18n/config'

import enLayout from '../../messages/en/layout.json'
import frLayout from '../../messages/fr/layout.json'

/**
 * Dernier filet : remplace le layout racine, donc hors de
 * `NextIntlClientProvider`. Seuls les textes du layout sont embarqués (quelques
 * lignes par langue) ; la langue se lit dans le navigateur, une fois monté.
 */
const LAYOUT_MESSAGES = { fr: frLayout, en: enLayout }

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  const locale = useIsClient() ? readClientLocale() : DEFAULT_LOCALE
  const t = createTranslator({
    locale,
    messages: { layout: LAYOUT_MESSAGES[locale] },
    namespace: 'layout.error',
  })

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: '100svh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#f4f3ee',
          color: '#1b1a17',
        }}
      >
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>{t('title')}</h1>
          <p style={{ marginBottom: 16, opacity: 0.7 }}>{t('globalDescription')}</p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#e8412c',
              color: '#fff',
              border: 0,
              borderRadius: 12,
              padding: '12px 20px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('retry')}
          </button>
        </div>
      </body>
    </html>
  )
}
