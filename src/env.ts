import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

/**
 * Variables d'environnement validées au démarrage.
 *
 * - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` est le nom actuel de la clé publique
 *   Supabase ; l'ancien `NEXT_PUBLIC_SUPABASE_ANON_KEY` reste accepté pour ne pas
 *   casser les environnements déjà configurés (même valeur).
 * - `NEXT_PUBLIC_SITE_URL` sert aux liens d'invitation et aux métadonnées ; sur
 *   Vercel, on retombe sur l'URL de production du projet si elle n'est pas définie.
 */
const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined

export const env = createEnv({
  server: {},
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? vercelProductionUrl,
  },
  emptyStringAsUndefined: true,
})
