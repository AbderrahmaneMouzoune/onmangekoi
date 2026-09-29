/**
 * Connexion par un fournisseur externe (Google, Apple) — issue #20.
 *
 * Deux parcours partagent la même route de retour (`/auth/callback`) :
 *  - `link` : depuis « Mon compte », l'utilisateur courant — souvent anonyme —
 *    rattache une identité Google ou Apple (`linkIdentity`). Il garde son
 *    `user_id`, donc ses listes et ses sessions : rien à migrer ;
 *  - `login` : depuis `/login`, on se reconnecte sur un autre appareil au
 *    compte auquel cette identité a été liée (`signInWithOAuth`).
 *
 * Logique pure, sans Supabase ni Next : testable unitairement.
 */

import { router } from '@/config/router.config'

export const OAUTH_PROVIDERS = ['google', 'apple'] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: 'Google',
  apple: 'Apple',
}

export const OAUTH_INTENTS = ['link', 'login'] as const
export type OAuthIntent = (typeof OAUTH_INTENTS)[number]

/**
 * Échecs possibles d'un parcours OAuth. Ce sont des codes métier `omk:` :
 * leur libellé vit dans `OMK_MESSAGES`, comme pour les erreurs levées en base.
 */
export const OAUTH_FAILURES = [
  'identity_taken',
  'oauth_cancelled',
  'oauth_unavailable',
  'oauth_failed',
] as const
export type OAuthFailure = (typeof OAUTH_FAILURES)[number]

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return typeof value === 'string' && (OAUTH_PROVIDERS as readonly string[]).includes(value)
}

export function isOAuthIntent(value: unknown): value is OAuthIntent {
  return typeof value === 'string' && (OAUTH_INTENTS as readonly string[]).includes(value)
}

export function isOAuthFailure(value: unknown): value is OAuthFailure {
  return typeof value === 'string' && (OAUTH_FAILURES as readonly string[]).includes(value)
}

/**
 * Codes d'erreur Supabase Auth qui signifient « cette identité appartient déjà
 * à quelqu'un d'autre ». `email_exists` couvre le cas voisin : l'adresse du
 * compte Google ou Apple est déjà celle d'un autre compte onmangekoi.
 */
const IDENTITY_TAKEN_CODES = new Set(['identity_already_exists', 'email_exists'])

/** Le projet n'accepte pas (ou plus) ce fournisseur, ou la liaison manuelle est coupée. */
const UNAVAILABLE_CODES = new Set(['manual_linking_disabled', 'provider_disabled'])

/** Refus volontaire chez le fournisseur (« Annuler » sur l'écran Google ou Apple). */
const CANCELLED_CODES = new Set(['access_denied', 'user_cancelled_authorize'])

/** Ramène un code d'erreur Supabase Auth à l'un des échecs connus de l'app. */
export function oauthFailureFromCode(code: string | null | undefined): OAuthFailure {
  const normalized = code?.trim().toLowerCase() ?? ''
  if (IDENTITY_TAKEN_CODES.has(normalized)) return 'identity_taken'
  if (UNAVAILABLE_CODES.has(normalized)) return 'oauth_unavailable'
  if (CANCELLED_CODES.has(normalized)) return 'oauth_cancelled'
  return 'oauth_failed'
}

export interface OAuthCallbackParams {
  error?: string | null
  error_code?: string | null
  error_description?: string | null
}

/**
 * Lit l'échec éventuel que Supabase Auth a posé dans l'URL de retour
 * (`?error=…&error_code=…&error_description=…`). `null` si le retour est un
 * succès. Le code précis (`error_code`) prime sur la catégorie OAuth
 * (`error`), plus vague ; la description ne sert qu'en dernier recours, pour
 * les versions d'Auth qui n'envoient pas de code.
 */
export function oauthFailureFromCallback(params: OAuthCallbackParams): OAuthFailure | null {
  const { error, error_code: errorCode, error_description: description } = params
  if (!error && !errorCode) return null

  if (errorCode) {
    const failure = oauthFailureFromCode(errorCode)
    if (failure !== 'oauth_failed') return failure
  }
  if (description && /already (been )?linked|already exists/i.test(description)) {
    return 'identity_taken'
  }
  return oauthFailureFromCode(error)
}

/** Fournisseurs rattachés à un utilisateur Supabase, dans l'ordre d'affichage. */
export function linkedOAuthProviders(providers: readonly unknown[] | undefined): OAuthProvider[] {
  if (!providers) return []
  return OAUTH_PROVIDERS.filter((provider) => providers.includes(provider))
}

/**
 * Découpe la liste des fournisseurs activés (`NEXT_PUBLIC_AUTH_PROVIDERS`,
 * ex. `google,apple`) : casse et espaces ignorés, doublons retirés. La
 * validation des valeurs revient au schéma Zod qui l'appelle.
 */
export function splitProviderList(raw: string | undefined): string[] {
  if (!raw) return []
  const values = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set(values)]
}

/** Intention lue dans l'URL de retour ; une valeur absente ou forgée vaut `login`. */
export function parseOAuthIntent(raw: string | null | undefined): OAuthIntent {
  return isOAuthIntent(raw) ? raw : 'login'
}

/** Destination par défaut d'un parcours, quand `next` est absent ou refusé. */
export function oauthDefaultNext(intent: OAuthIntent): string {
  return intent === 'link' ? router.account() : router.home()
}

/**
 * Après un échec, on revient là d'où l'on est parti — « Mon compte » pour une
 * liaison, `/login` pour une reconnexion — avec le motif, traduit sur place.
 */
export function oauthFailurePath(intent: OAuthIntent, next: string, failure: OAuthFailure): string {
  return intent === 'link'
    ? router.account({ auth: failure })
    : router.login(next === router.home() ? null : next, { error: failure })
}

/**
 * Après un succès. Une reconnexion qui tombe sur un compte **tout neuf** — sans
 * pseudo, parce que cette identité n'avait encore été liée à personne — mène
 * à « Mon compte » : c'est là qu'on choisit son pseudo, et le bandeau explique
 * pourquoi les listes attendues n'y sont pas.
 */
export function oauthSuccessPath(
  intent: OAuthIntent,
  next: string,
  { isNewAccount }: { isNewAccount: boolean }
): string {
  if (intent === 'link') {
    return next === router.account() ? router.account({ auth: 'linked' }) : next
  }
  return isNewAccount ? router.account({ auth: 'created' }) : next
}
