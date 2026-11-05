import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { omkCode } from '@/domain/errors'
import { env } from '@/env'
import { translateError } from '@/i18n/server'
import { callerFromAuthInfo, type McpCaller } from '@/lib/mcp/auth'

import type { Database } from '@/data-access/models/database'
import type { AuthInfo, CallToolResult } from '@modelcontextprotocol/server'

/**
 * Boîte à outils commune aux tools MCP : l'appelant, un client Supabase qui
 * agit en son nom, et la mise en forme des réponses.
 */

/** Contexte d'exécution d'un tool authentifié. */
export interface McpToolContext {
  caller: McpCaller
  /** Client Supabase qui porte le jeton de l'utilisateur : RLS et RPC s'appliquent. */
  supabase: SupabaseClient<Database>
}

/**
 * Client Supabase par appel, avec le jeton OAuth de l'utilisateur. Rien n'est
 * partagé entre deux requêtes : pas de cookie, pas de stockage, pas de
 * rafraîchissement — le client MCP renouvelle lui-même son jeton.
 */
export function createCallerClient(token: string): SupabaseClient<Database> {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { accessToken: async () => token }
  )
}

/** Contexte du tool, ou `null` si la requête n'a pas d'appelant vérifié. */
export function toolContext(authInfo: AuthInfo | undefined): McpToolContext | null {
  const caller = callerFromAuthInfo(authInfo)
  if (!caller || !authInfo) return null
  return { caller, supabase: createCallerClient(authInfo.token) }
}

/**
 * Réponse réussie : la sortie structurée (validée par l'`outputSchema` du
 * tool) et sa copie JSON en texte, pour les clients qui ne lisent que
 * `content`.
 */
export function toolResult<T extends Record<string, unknown>>(output: T): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(output) }],
    structuredContent: output,
  }
}

/**
 * Erreur rendue au modèle. Un refus métier (`omk:<code>`) devient son message
 * traduit, préfixé du code pour que l'agent puisse réagir (« session_closed »,
 * « already_voted »…). Une erreur technique ne sort jamais telle quelle.
 */
export async function toolError(error: unknown): Promise<CallToolResult> {
  const code = omkCode(error)
  const message = await translateError(error)
  return {
    isError: true,
    content: [{ type: 'text', text: code ? `${code}: ${message}` : message }],
  }
}

/** Refus avant tout appel : l'appelant n'est pas authentifié. */
export function unauthenticated(): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: 'unauthenticated: reconnect onmangekoi to continue.' }],
  }
}

/**
 * Enveloppe le corps d'un tool authentifié : contexte résolu, erreurs
 * converties. Le corps renvoie directement la sortie structurée.
 */
export async function runTool<T extends Record<string, unknown>>(
  authInfo: AuthInfo | undefined,
  body: (context: McpToolContext) => Promise<T>
): Promise<CallToolResult> {
  const context = toolContext(authInfo)
  if (!context) return unauthenticated()
  try {
    return toolResult(await body(context))
  } catch (error) {
    return toolError(error)
  }
}
