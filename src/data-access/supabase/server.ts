import 'server-only'

import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

import { env } from '@/env'

import type { Database } from '@/data-access/models/database'

/**
 * Client Supabase côté serveur (Server Components, Server Actions, Route Handlers).
 * Mis en cache par requête via `react.cache` : un seul client par rendu.
 * Ce module est marqué `server-only` : l'importer depuis un Client Component
 * échoue à la compilation au lieu de tirer `next/headers` dans le bundle.
 */
export const createServerClient = cache(async () => {
  const cookieStore = await cookies()

  return createSupabaseServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Appelé depuis un Server Component : les cookies sont rafraîchis
            // par le proxy, on peut ignorer l'écriture ici.
          }
        },
      },
    }
  )
})

export type ServerSupabaseClient = Awaited<ReturnType<typeof createServerClient>>
