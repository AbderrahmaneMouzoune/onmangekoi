import { PROTECTED_PREFIXES } from '@/config/router.config'

/**
 * Helpers de routage partagés entre le proxy, les actions et les pages.
 * Purs, sans dépendance Next : testables unitairement. Les URLs elles-mêmes
 * vivent dans `config/router.config.ts`.
 */

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function isProtectedPath(pathname: string): boolean {
  return matchesPrefix(pathname, PROTECTED_PREFIXES)
}

/**
 * Routes sur lesquelles le proxy rafraîchit la session Supabase : les routes
 * protégées, plus celles qui lisent l'utilisateur sans l'exiger — l'onboarding
 * et la connexion (qui redirigent qui est déjà là), la liste partagée (une
 * liste publique ouverte par quelqu'un de connecté doit le rester) et le
 * retour des emails d'authentification.
 *
 * Les autres pages (accueil, classement public, nouveautés…) passent aussi
 * par le proxy, mais seulement pour la langue : pas d'aller-retour vers
 * Supabase Auth à chaque visite.
 */
export const SESSION_REFRESH_PREFIXES = [
  ...PROTECTED_PREFIXES,
  '/setup',
  '/login',
  '/l',
  '/auth',
] as const

export function needsSessionRefresh(pathname: string): boolean {
  return matchesPrefix(pathname, SESSION_REFRESH_PREFIXES)
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
