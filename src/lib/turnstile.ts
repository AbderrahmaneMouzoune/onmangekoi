/**
 * Contrat partagé du captcha Cloudflare Turnstile — la partie que le
 * navigateur et le serveur doivent lire de la même façon. La vérification
 * elle-même est côté serveur uniquement (`data-access/turnstile.ts`).
 */

import type { ErrorCode } from '@/domain/errors'

/** Nom du champ que le widget dépose dans le formulaire, imposé par Cloudflare. */
export const TURNSTILE_FIELD = 'cf-turnstile-response'

/** Rendu explicite : c'est nous qui décidons quand et où le widget apparaît. */
export const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/**
 * Résultat de la vérification :
 *  - `ok` — jeton valide, ou captcha désactivé sur ce déploiement ;
 *  - `missing` — le widget n'a pas encore produit de jeton (script en cours de
 *    chargement, jeton expiré après un long remplissage) ; c'est réessayable ;
 *  - `rejected` — Cloudflare a refusé le jeton.
 */
export type TurnstileVerdict = 'ok' | 'missing' | 'rejected'

/** Code d'erreur de chaque refus, traduit dans `errors.codes` (messages). */
export const TURNSTILE_ERRORS: Record<Exclude<TurnstileVerdict, 'ok'>, ErrorCode> = {
  missing: 'turnstile_missing',
  rejected: 'turnstile_rejected',
}
