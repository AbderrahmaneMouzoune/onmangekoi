import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

/**
 * Variables d'environnement validées au démarrage.
 * `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` remplace l'ancien nom `ANON_KEY`
 * (nomenclature Supabase actuelle) ; la valeur reste la clé publique du projet.
 */
export const env = createEnv({
  server: {},
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
  emptyStringAsUndefined: true,
})
