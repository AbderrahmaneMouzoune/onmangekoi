import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { test as base } from '@playwright/test'
import { createTranslator } from 'next-intl'

import type { AppMessages } from '../../src/i18n/messages'

/**
 * Les parcours e2e tournent en français **et** en anglais (issue #14) : chaque
 * projet Playwright a sa langue (`playwright.config.ts` : `mobile`, `desktop`
 * en `fr-FR`, `mobile-en`, `desktop-en` en `en-US`), et les specs lisent leurs
 * libellés dans les mêmes fichiers de messages que l'app. Un texte qui change
 * dans `messages/` ne casse donc aucun test ; un texte oublié en dur dans un
 * composant, si — c'est exactement ce qu'on veut voir.
 *
 * `import { test, expect } from './support/i18n'` à la place de
 * `@playwright/test` : la fixture `i18n` donne `t` (le texte exact) et
 * `match` (une expression régulière, pour les rôles et les textes partiels).
 */

type Locale = 'fr' | 'en'

const MESSAGES_DIR = path.join(process.cwd(), 'messages')

/** Les messages d'une langue, lus comme l'app les assemble : un fichier par espace de noms. */
function loadMessages(locale: Locale): AppMessages {
  const dir = path.join(MESSAGES_DIR, locale)
  const entries = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => [
      file.replace(/\.json$/, ''),
      JSON.parse(readFileSync(path.join(dir, file), 'utf8')),
    ])
  return Object.fromEntries(entries) as AppMessages
}

function createE2eI18n(locale: Locale) {
  const t = createTranslator({ locale, messages: loadMessages(locale), timeZone: 'Europe/Paris' })
  type Key = Parameters<typeof t>[0]
  type Values = Record<string, string | number>

  /**
   * Le message sous forme d'expression régulière, insensible à la casse.
   * Les arguments simples qu'on ne connaît pas d'avance (`{others}`,
   * `{names}`, le nom d'un resto tiré au hasard) deviennent `.+` ; ceux des
   * pluriels et des `select` doivent être fournis. `exact` ancre le motif.
   */
  function match(key: Key, values: Values = {}, { exact = false } = {}): RegExp {
    const raw = String(t.raw(key))
    const unknown = [...raw.matchAll(/\{(\w+)\}/g)]
      .map(([, name]) => name as string)
      .filter((name) => !(name in values))
    const placeholders = Object.fromEntries(unknown.map((name) => [name, `\u0001${name}\u0002`]))
    const text = t(key, { ...placeholders, ...values } as never)
    const pattern = escapeRegExp(text).replace(/\u0001\w+\u0002/g, '.+')
    return new RegExp(exact ? `^${pattern}$` : pattern, 'i')
  }

  return {
    locale,
    /** Le texte exact, tel que l'app l'affiche dans la langue du projet. */
    t: (key: Key, values?: Values): string => t(key, values as never),
    match,
  }
}

export type E2eI18n = ReturnType<typeof createE2eI18n>

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * `test` de Playwright, avec la fixture `i18n` dans la langue du navigateur
 * — celle du projet, ou celle qu'impose `test.use({ locale })`.
 */
export const test = base.extend<{ i18n: E2eI18n }>({
  // `provide` et non `use` : la règle des hooks React prendrait l'appel pour
  // un `use()` de React.
  i18n: async ({ locale }, provide) => {
    await provide(createE2eI18n(locale?.toLowerCase().startsWith('en') ? 'en' : 'fr'))
  },
})

export { expect } from '@playwright/test'
