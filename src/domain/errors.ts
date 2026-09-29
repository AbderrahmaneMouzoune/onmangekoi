/**
 * Erreurs métier : un code, jamais un texte. La base lève
 * `raise exception 'omk:<code>'` ; l'application lève `AppError(code)` avec le
 * même préfixe. La traduction en message utilisateur vit dans
 * `messages/<langue>/errors.json` et se fait au dernier moment
 * (`translateError` côté serveur, `useErrorMessage` côté client — voir
 * `src/i18n/errors.ts`). Tout message non préfixé est traité comme une erreur
 * technique et remplacé par un libellé générique : on n'expose jamais un
 * message Postgres brut.
 */

import type { AppMessages } from '@/i18n/messages'

/** Code métier connu : une clé de `errors.codes` dans les messages. */
export type ErrorCode = keyof AppMessages['errors']['codes']

const OMK_PREFIX = 'omk:'

/**
 * Fabrique une erreur métier avec le même contrat que la base. Sert aux rares
 * refus que Postgres ne peut pas signaler par une exception — voir
 * `joinSession` dans `data-access/sessions.ts`.
 */
export function omkError(code: string): Error {
  return new Error(`${OMK_PREFIX}${code}`)
}

/**
 * Message d'une règle de validation (Zod) qui dit la même chose qu'un refus de
 * la base : il porte le code, et se traduit comme lui.
 */
export function omkMessage(code: ErrorCode): string {
  return `${OMK_PREFIX}${code}`
}

export function omkCode(error: unknown): string | null {
  const message = extractMessage(error)
  if (!message || !message.startsWith(OMK_PREFIX)) return null
  return message.slice(OMK_PREFIX.length).trim()
}

function extractMessage(error: unknown): string | null {
  if (!error) return null
  if (typeof error === 'string') return error
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' ? message : null
  }
  return null
}

/**
 * Erreur métier levée par l'application (use case, accès aux données) quand
 * la base n'a rien à dire — « liste vide », « Google n'a pas répondu ». Elle
 * suit le contrat des erreurs de la base (`omk:<code>`) et porte les valeurs
 * de son message, s'il en a (`{ days }`).
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly values?: Record<string, string | number>
  ) {
    super(`${OMK_PREFIX}${code}`)
    this.name = 'AppError'
  }
}
