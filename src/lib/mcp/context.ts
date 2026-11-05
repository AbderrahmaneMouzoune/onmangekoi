import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { createPublicClient } from '@/data-access/supabase/public'
import { omkCode } from '@/domain/errors'
import { env } from '@/env'
import { translateError } from '@/i18n/server'
import { callerFromAuthInfo, type McpCaller } from '@/lib/mcp/auth'

import type { McpAccess } from '@/data-access/mcp'
import type { Database } from '@/data-access/models/database'
import type { AuthInfo, CallToolResult } from '@modelcontextprotocol/server'

/**
 * Boîte à outils commune aux tools MCP : l'appelant, un client Supabase qui
 * agit en son nom, et la mise en forme des réponses.
 */

type OAuthCaller = Extract<McpCaller, { mode: 'oauth' }>

/** Contexte d'exécution d'un tool réservé aux connexions OAuth. */
export interface McpToolContext {
  caller: OAuthCaller
  /** Client Supabase qui porte le jeton de l'utilisateur : RLS et RPC s'appliquent. */
  supabase: SupabaseClient<Database>
}

/**
 * Contexte d'un tool ouvert aux deux modes de connexion. `access` sert aux
 * RPC `mcp_*` (catalogue et listes) : avec un jeton personnel, client public +
 * jeton résolu en base ; en OAuth, client de l'utilisateur + jeton nul,
 * `auth.uid()` fait foi (voir `mcp_act_as`).
 */
export interface McpSharedContext {
  caller: McpCaller
  access: McpAccess
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

/** Contexte d'un tool OAuth, ou `null` si l'appelant n'est pas connecté en OAuth. */
export function toolContext(authInfo: AuthInfo | undefined): McpToolContext | null {
  const caller = callerFromAuthInfo(authInfo)
  if (!caller || caller.mode !== 'oauth' || !authInfo) return null
  return { caller, supabase: createCallerClient(authInfo.token) }
}

/** Contexte d'un tool partagé, ou `null` sans appelant vérifié. */
export function sharedToolContext(authInfo: AuthInfo | undefined): McpSharedContext | null {
  const caller = callerFromAuthInfo(authInfo)
  if (!caller || !authInfo) return null
  const access: McpAccess =
    caller.mode === 'token'
      ? { client: createPublicClient(), token: caller.token }
      : { client: createCallerClient(authInfo.token), token: null }
  return { caller, access }
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
 * Refus d'un tool réservé à OAuth quand l'IA est branchée par jeton
 * personnel : le message dit comment débloquer, pour que l'IA le relaie.
 */
export function requiresOAuth(): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: 'requires_oauth: this tool (sessions, votes, history, profile) needs the OAuth connection. Ask the user to add onmangekoi as a connector with the URL alone (no ?key=) and sign in; personal tokens only cover the catalogue and lists.',
      },
    ],
  }
}

/**
 * Enveloppe le corps d'un tool réservé à OAuth : contexte résolu, erreurs
 * converties. Le corps renvoie directement la sortie structurée.
 */
export async function runTool<T extends Record<string, unknown>>(
  authInfo: AuthInfo | undefined,
  body: (context: McpToolContext) => Promise<T>
): Promise<CallToolResult> {
  const caller = callerFromAuthInfo(authInfo)
  if (!caller) return unauthenticated()
  const context = toolContext(authInfo)
  if (!context) return requiresOAuth()
  try {
    return toolResult(await body(context))
  } catch (error) {
    return toolError(error)
  }
}

/** Enveloppe le corps d'un tool ouvert aux deux modes de connexion. */
export async function runSharedTool<T extends Record<string, unknown>>(
  authInfo: AuthInfo | undefined,
  body: (context: McpSharedContext) => Promise<T>
): Promise<CallToolResult> {
  const context = sharedToolContext(authInfo)
  if (!context) return unauthenticated()
  try {
    return toolResult(await body(context))
  } catch (error) {
    return toolError(error)
  }
}
