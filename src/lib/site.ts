import { env } from '@/env'

/** URL publique du site, sans slash final. */
export function siteUrl(): string {
  return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')
}

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${siteUrl()}${normalized}`
}

export function inviteUrl(inviteToken: string): string {
  return absoluteUrl(`/join/${inviteToken}`)
}

export function listShareUrl(shareToken: string): string {
  return absoluteUrl(`/l/${shareToken}`)
}

export const SITE_NAME = 'onmangekoi'
export const SITE_TAGLINE = 'Décidez où manger ensemble, sans débat.'
