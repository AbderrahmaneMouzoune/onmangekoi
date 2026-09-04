/**
 * Helpers de routage partagés entre le proxy, les actions et les pages.
 * Purs, sans dépendance Next : testables unitairement.
 */

const PROTECTED_PREFIXES = ['/sessions', '/join', '/lists', '/l', '/account'] as const

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * Un chemin `next` n'est accepté que s'il est interne et absolu
 * (`/sessions/abc`) : ni `//evil.com`, ni `https://…`, ni chemin relatif.
 */
export function sanitizeNextPath(candidate: string | null | undefined, fallback = '/'): string {
  if (!candidate) return fallback
  const value = candidate.trim()
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback
  if (/[\r\n]/.test(value)) return fallback
  if (value.length > 512) return fallback
  return value
}

export function buildSetupUrl(next?: string | null): { pathname: string; search: string } {
  const safe = next ? sanitizeNextPath(next, '') : ''
  const params = new URLSearchParams()
  if (safe && safe !== '/') params.set('next', safe)
  const search = params.toString()
  return { pathname: '/setup', search: search ? `?${search}` : '' }
}

export function setupHref(next?: string | null): string {
  const { pathname, search } = buildSetupUrl(next)
  return `${pathname}${search}`
}
