import { slugify } from '@/lib/slug'

/**
 * Source de vérité des URLs de l'application.
 * Aucune route ne s'écrit en dur ailleurs : pages, actions, composants, proxy
 * et tests passent par `router`.
 *
 * Tout est une fonction, même pour les routes statiques : l'appel est uniforme
 * (`router.home()`, `router.session(id)`) et refactorable d'un seul endroit.
 */

/** Préfixes qui exigent un utilisateur (le proxy redirige vers l'onboarding). */
export const PROTECTED_PREFIXES = ['/sessions', '/join', '/lists', '/l', '/account'] as const

/** Longueur d'un code de partage de liste (Crockford base32). */
export const SHARE_CODE_LENGTH = 10
/** Longueur d'un code d'invitation de session (Crockford base32). */
export const INVITE_CODE_LENGTH = 6

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
  /** Export RGPD : Route Handler qui renvoie le JSON des données du compte. */
  accountExport: () => '/account/export',

  join: () => '/join',
  /** Join direct : token long (lien) ou code court (QR / saisie). */
  joinInvite: (identifier: string) => `/join/${encodeURIComponent(identifier)}`,

  sessionNew: () => '/sessions/new',
  session: (id: string) => `/sessions/${id}`,
  sessionResults: (id: string) => `/sessions/${id}/results`,

  lists: () => '/lists',
  listNew: () => '/lists/new',
  list: (id: string) => `/lists/${id}`,
  /**
   * Lien de partage lisible : `/l/restos-du-bureau-7K3M9P2QWX`.
   * Le slug est décoratif (ignoré à la résolution) ; seul le code compte,
   * donc renommer la liste ne casse pas les anciens liens.
   */
  sharedList: (shareCode: string, name?: string | null) => {
    const slug = name ? slugify(name) : ''
    return `/l/${slug ? `${slug}-` : ''}${shareCode}`
  },

  authConfirm: () => '/auth/confirm',

  privacy: () => '/legal/privacy',
} as const

export type Router = typeof router
