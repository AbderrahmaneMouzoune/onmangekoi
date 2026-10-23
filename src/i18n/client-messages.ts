import type { AppMessages } from './messages'

/**
 * Espaces de noms lus par des Client Components (`useTranslations` dans un
 * module atteint depuis un `'use client'`).
 *
 * `NextIntlClientProvider` sans `messages` envoie tout le catalogue de la
 * langue dans le payload RSC de chaque page — environ la moitié du HTML de
 * l'accueil. Les textes rendus côté serveur (titres de pages, métadonnées,
 * images Open Graph, politique de confidentialité…) n'ont rien à faire dans
 * le navigateur : seuls ceux-ci y partent.
 *
 * `client-messages.test.ts` parcourt le graphe d'imports des modules client
 * et échoue si l'un d'eux lit un espace absent de cette liste : en ajouter un
 * nouveau dans un composant client demande de l'ajouter ici.
 */
export const CLIENT_NAMESPACES = [
  'account.analytics',
  'account.delete',
  'account.email',
  'account.foodConstraints',
  'account.login',
  'account.password',
  'account.pseudo',
  'account.signOut',
  'changelog.navLink',
  'common',
  'errors',
  'groups.card',
  'groups.save',
  'home.invitations',
  'layout',
  'lists',
  'onboarding.pseudo',
  'pwa.install',
  'restaurants',
  'session',
] as const

type Tree = { [key: string]: unknown }

/** Le sous-catalogue de `CLIENT_NAMESPACES`, avec la même forme que l'original. */
export function pickClientMessages(messages: AppMessages): Partial<AppMessages> {
  const picked: Tree = {}
  for (const namespace of CLIENT_NAMESPACES) {
    const keys = namespace.split('.')
    let source: unknown = messages
    for (const key of keys) source = (source as Tree | undefined)?.[key]
    if (source === undefined) continue

    let target = picked
    for (const key of keys.slice(0, -1)) target = (target[key] ??= {}) as Tree
    target[keys[keys.length - 1]] = source
  }
  return picked as Partial<AppMessages>
}
