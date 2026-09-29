import 'server-only'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'

import { AppError, omkCode, type ErrorCode } from '@/domain/errors'

import { LOCALES } from './config'
import { describeError, type ErrorFallback } from './errors'

/**
 * Message utilisateur d'une erreur attrapée côté serveur, dans la langue de
 * la requête. C'est ce que renvoient les Server Actions dans `{ error }`.
 */
export async function translateError(error: unknown, fallback?: ErrorFallback): Promise<string> {
  const t = await getTranslations('errors')
  return describeError(t, error, fallback)
}

/**
 * Message d'un refus que l'action décide elle-même, avant tout appel — pas de
 * pseudo, identifiant illisible : le même texte que si la base l'avait levé.
 */
export async function errorMessage(code: ErrorCode): Promise<string> {
  return translateError(new AppError(code))
}

/**
 * Message d'une validation Zod refusée. Chaque règle de nos schémas porte un
 * code (`omkMessage('…')`) et se traduit comme une erreur de la base. Un
 * refus sans code vient de Zod lui-même (« Invalid UUID », en anglais
 * technique) : il n'atteint jamais l'écran, le repli de l'action le remplace.
 */
export async function translateIssue(
  issue: { message: string } | undefined,
  fallback: string
): Promise<string> {
  if (!issue || !omkCode(issue)) return fallback
  return translateError(issue)
}

/**
 * `revalidatePath` pour une URL visible (`/sessions/7K3M9P`) ou un motif
 * (`/lists/[code]`).
 *
 * Les pages vivent sous le segment caché `app/[locale]` : le chemin rendu est
 * `/fr/sessions/7K3M9P` ou `/en/sessions/7K3M9P`, et c'est lui que le cache
 * connaît. On invalide donc chaque langue — sans quoi un vote ne rafraîchirait
 * que la version d'une seule langue. L'URL visible est invalidée aussi : selon
 * l'étape du rendu, Next étiquette la page par l'une ou l'autre, et une
 * étiquette de trop ne coûte rien.
 *
 * `revalidateLocalizedPath('/', 'layout')` reste l'invalidation de tout le
 * site : le layout racine englobe toutes les langues.
 */
export function revalidateLocalizedPath(path: string, type?: 'layout' | 'page'): void {
  if (path === '/' && type === 'layout') {
    revalidatePath('/', 'layout')
    return
  }
  const suffix = path === '/' ? '' : path
  // Un motif (`/lists/[code]`) nomme la route, pas une URL : son segment de
  // langue s'écrit lui aussi en motif.
  if (path.includes('[')) {
    revalidatePath(`/[locale]${suffix}`, type)
    return
  }
  revalidatePath(path, type)
  for (const locale of LOCALES) revalidatePath(`/${locale}${suffix}`, type)
}
