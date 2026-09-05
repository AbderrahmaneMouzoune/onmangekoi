import 'server-only'

import { router } from '@/config/router.config'
import { env } from '@/env'

import type { ListTarget, SessionTarget } from '@/config/router.config'

export { SITE_NAME, SITE_TAGLINE } from '@/lib/brand'

/** URL publique du site, sans slash final (voir `resolveSiteUrl` dans `env.ts`). */
export function siteUrl(): string {
  return env.SITE_URL.replace(/\/+$/, '')
}

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${siteUrl()}${normalized}`
}

/** Lien d'invitation lisible : `https://…/join/dej-du-lundi-7K3M9P`. */
export function inviteUrl(session: SessionTarget): string {
  return absoluteUrl(router.joinInvite(session))
}

/** Lien de partage d'une liste : `https://…/l/restos-du-bureau-7K3M9P2QWX`. */
export function listShareUrl(list: ListTarget): string {
  return absoluteUrl(router.sharedList(list))
}
