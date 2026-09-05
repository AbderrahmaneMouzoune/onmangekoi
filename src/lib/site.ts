import 'server-only'

import { router } from '@/config/router.config'
import { env } from '@/env'

export { SITE_NAME, SITE_TAGLINE } from '@/lib/brand'

/** URL publique du site, sans slash final (voir `resolveSiteUrl` dans `env.ts`). */
export function siteUrl(): string {
  return env.SITE_URL.replace(/\/+$/, '')
}

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${siteUrl()}${normalized}`
}

export function inviteUrl(inviteToken: string): string {
  return absoluteUrl(router.joinInvite(inviteToken))
}

export function listShareUrl(shareCode: string, name?: string | null): string {
  return absoluteUrl(router.sharedList(shareCode, name))
}
