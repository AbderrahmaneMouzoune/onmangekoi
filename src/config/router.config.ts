/**
 * Source de vérité des URLs de l'application.
 * Aucune route ne s'écrit en dur ailleurs : pages, actions, composants, proxy
 * et tests passent par `router`.
 *
 * Tout est une fonction, même pour les routes statiques : l'appel est uniforme
 * (`router.home()`, `router.session(session)`) et refactorable d'un seul endroit.
 *
 * Les ressources s'adressent par leur code court (`7K3M9P`), celui qu'on se dit
 * à voix haute : on passe donc la ligne elle-même plutôt qu'un id, pour qu'une
 * URL ne puisse pas se construire sans lui. Une chaîne reste acceptée pour
 * reconduire un paramètre reçu tel quel (ancien lien, code saisi à la main).
 */

/** Préfixes qui exigent un utilisateur (le proxy redirige vers l'onboarding). */
export const PROTECTED_PREFIXES = ['/sessions', '/join', '/lists', '/l', '/account'] as const

/** Longueur d'un code de partage de liste (Crockford base32). */
export const SHARE_CODE_LENGTH = 10
/** Longueur d'un code d'invitation de session (Crockford base32). */
export const INVITE_CODE_LENGTH = 6

/**
 * Motifs de routes dynamiques, pour `revalidatePath(…, 'page')` quand on ne
 * connaît que l'id d'une ressource et pas son code.
 */
export const ROUTE_PATTERNS = {
  list: '/lists/[code]',
  sharedList: '/l/[code]',
} as const

/** Une session, ou le segment d'URL déjà reçu. */
export type SessionTarget = string | { invite_code: string }
/** Une liste, ou le segment d'URL déjà reçu. */
export type ListTarget = string | { share_code: string }

function sessionSegment(target: SessionTarget): string {
  return typeof target === 'string' ? target : target.invite_code
}

function listSegment(target: ListTarget): string {
  return typeof target === 'string' ? target : target.share_code
}

function withNext(pathname: string, next?: string | null): string {
  if (!next || next === '/') return pathname
  return `${pathname}?next=${encodeURIComponent(next)}`
}

export const router = {
  home: () => '/',

  /** Onboarding pseudo ; `next` est la destination à reprendre ensuite. */
  setup: (next?: string | null) => withNext('/setup', next),
  login: (next?: string | null) => withNext('/login', next),
  account: (params?: { auth?: 'invalid' | 'expired' | 'confirmed' }) =>
    params?.auth ? `/account?auth=${params.auth}` : '/account',

  join: () => '/join',
  /** Invitation : `/join/7K3M9P` (code court, ou ancien token long). */
  joinInvite: (target: SessionTarget) => `/join/${encodeURIComponent(sessionSegment(target))}`,

  sessionNew: () => '/sessions/new',
  /** Salle de session : `/sessions/7K3M9P`. */
  session: (target: SessionTarget) => `/sessions/${sessionSegment(target)}`,
  sessionResults: (target: SessionTarget) => `/sessions/${sessionSegment(target)}/results`,

  lists: () => '/lists',
  listNew: () => '/lists/new',
  /** Liste, côté propriétaire : `/lists/7K3M9P2QWX`. */
  list: (target: ListTarget) => `/lists/${listSegment(target)}`,
  /** Lien de partage d'une liste : `/l/7K3M9P2QWX`. */
  sharedList: (target: ListTarget) => `/l/${listSegment(target)}`,

  authConfirm: () => '/auth/confirm',
} as const

export type Router = typeof router
