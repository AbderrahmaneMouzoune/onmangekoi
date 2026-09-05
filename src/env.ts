import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i

/**
 * URL publique du site, sans jamais retomber sur localhost en production.
 * Ordre de résolution :
 *  1. `NEXT_PUBLIC_SITE_URL` si elle est définie et n'est pas une URL locale
 *     alors qu'on tourne sur Vercel (garde-fou contre une variable copiée
 *     depuis `.env.local`) ;
 *  2. sur Vercel, l'URL fournie par la plateforme : domaine de production en
 *     `production`, URL de branche ou de déploiement en `preview` ;
 *  3. `http://localhost:3000` en développement.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const onVercel = Boolean(process.env.VERCEL)

  if (explicit && !(onVercel && LOCAL_HOST.test(explicit))) return explicit

  if (onVercel) {
    const production = process.env.VERCEL_PROJECT_PRODUCTION_URL
    const branch = process.env.VERCEL_BRANCH_URL
    const deployment = process.env.VERCEL_URL
    if (process.env.VERCEL_ENV === 'production' && production) return `https://${production}`
    if (branch) return `https://${branch}`
    if (deployment) return `https://${deployment}`
    if (production) return `https://${production}`
  }

  return explicit ?? 'http://localhost:3000'
}

export const env = createEnv({
  server: {
    /** Calculée : voir `resolveSiteUrl`. Sert aux liens d'invitation et aux métadonnées. */
    SITE_URL: z.url(),
    /**
     * Clé Places API (New). Optionnelle : sans elle, l'import Google est
     * simplement absent de l'interface, le reste de l'app fonctionne. Jamais
     * préfixée `NEXT_PUBLIC_` — elle ne doit pas atteindre le navigateur.
     */
    GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    /** Nom actuel de la clé publique Supabase ; l'ancien `NEXT_PUBLIC_SUPABASE_ANON_KEY` reste accepté. */
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    /**
     * Clé projet PostHog. **Optionnelle** : sans elle, aucune mesure n'est
     * chargée et aucun bandeau de consentement ne s'affiche (tests, CI,
     * previews, développement local).
     */
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
    /** Point d'ingestion PostHog — région européenne par défaut (RGPD). */
    NEXT_PUBLIC_POSTHOG_HOST: z.url().default('https://eu.i.posthog.com'),
  },
  runtimeEnv: {
    SITE_URL: resolveSiteUrl(),
    GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
  emptyStringAsUndefined: true,
})
