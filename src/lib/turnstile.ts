/**
 * Contrat partagé du captcha Cloudflare Turnstile — la partie que le
 * navigateur et le serveur doivent lire de la même façon. La vérification
 * elle-même est côté serveur uniquement (`data-access/turnstile.ts`).
 */

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

export const TURNSTILE_MESSAGES: Record<Exclude<TurnstileVerdict, 'ok'>, string> = {
  missing: 'Vérification anti-robot en cours. Réessaie dans un instant.',
  rejected: 'La vérification anti-robot a échoué. Recharge la page et réessaie.',
}
