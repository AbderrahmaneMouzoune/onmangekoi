'use client'

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr'

import { env } from '@/env'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient<Database> | undefined

/**
 * Client Supabase navigateur (Realtime, lectures sous RLS).
 * Singleton : `createBrowserClient` de @supabase/ssr est déjà idempotent,
 * on évite simplement de le réinstancier à chaque rendu.
 */
export function createBrowserClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createSupabaseBrowserClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
  }
  return browserClient
}
