/**
 * Variables publiques (`NEXT_PUBLIC_*`) pour le code navigateur.
 *
 * `env.ts` les valide avec zod, mais l'importer depuis un Client Component
 * embarque zod et `@t3-oss/env-nextjs` dans le JavaScript de chaque page :
 * le module d'analytics, monté dans le layout racine, suffisait à les envoyer
 * partout. Le navigateur lit donc ces valeurs ici, sans bibliothèque ; leur
 * validation reste dans `env.ts`, que le serveur évalue au build et au
 * démarrage, et qui reprend ces mêmes valeurs (mêmes alias, mêmes défauts).
 *
 * Chaque variable est écrite en entier (`process.env.NEXT_PUBLIC_…`) : c'est
 * ainsi que Next la remplace par sa valeur dans le bundle.
 */

/** Une variable vide vaut une variable absente (`emptyStringAsUndefined`). */
function present(value: string | undefined): string | undefined {
  return value ? value : undefined
}

export const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: present(process.env.NEXT_PUBLIC_SUPABASE_URL) as string,
  /** Nom actuel de la clé publique Supabase ; l'ancien `NEXT_PUBLIC_SUPABASE_ANON_KEY` reste accepté. */
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: present(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) as string,
  NEXT_PUBLIC_POSTHOG_KEY: present(process.env.NEXT_PUBLIC_POSTHOG_KEY),
  /** Point d'ingestion PostHog — région européenne par défaut (RGPD). */
  NEXT_PUBLIC_POSTHOG_HOST:
    present(process.env.NEXT_PUBLIC_POSTHOG_HOST) ?? 'https://eu.i.posthog.com',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: present(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: present(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
}
