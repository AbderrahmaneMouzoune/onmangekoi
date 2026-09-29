import { AppError, omkCode, type ErrorCode } from '@/domain/errors'

import type { AppMessages } from './messages'
import type { useTranslations } from 'next-intl'

/**
 * Traduction des erreurs métier (issue #14).
 *
 * Le domaine ne connaît que des codes : `omk:<code>` levé par Postgres, ou
 * `AppError(code)` levée par l'application. Le texte vit dans
 * `messages/<langue>/errors.json` :
 *  - `codes.<code>` — un message par code métier ;
 *  - `fallback.<clé>` — le message d'une action quand l'erreur n'a pas de code
 *    connu (« Impossible d'enregistrer le pseudo ») ;
 *  - `generic` — le dernier recours. Un message Postgres brut n'atteint
 *    jamais l'écran.
 *
 * Les Server Actions renvoient un message déjà traduit (`translateError`,
 * `src/i18n/server.ts`) : leur contrat `{ error: string }` ne change pas, et
 * les composants n'ont rien à traduire. Côté client, `useErrorMessage`
 * (`src/i18n/use-error-message.ts`) fait la même chose.
 */

export type ErrorFallback = keyof AppMessages['errors']['fallback']

type ErrorsTranslator = ReturnType<typeof useTranslations<'errors'>>

export function describeError(
  t: ErrorsTranslator,
  error: unknown,
  fallback?: ErrorFallback
): string {
  const code = omkCode(error)
  if (code && t.has(`codes.${code}` as `codes.${ErrorCode}`)) {
    const values = error instanceof AppError ? error.values : undefined
    return t(`codes.${code}` as `codes.${ErrorCode}`, values)
  }
  return fallback ? t(`fallback.${fallback}`) : t('generic')
}
