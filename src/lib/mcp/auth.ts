import 'server-only'

import { createPublicClient } from '@/data-access/supabase/public'
import { env } from '@/env'
import { MCP_KEY_PARAM } from '@/lib/mcp/endpoint'

import type { AuthInfo } from '@modelcontextprotocol/server'

/**
 * Authentification du serveur MCP (`/api/mcp`).
 *
 * Le serveur d'autorisation est Supabase Auth, en mode serveur OAuth 2.1 :
 * Claude, ChatGPT ou Cursor s'y enregistrent (DCR), l'utilisateur consent sur
 * `/oauth/consent`, et le client reçoit un jeton d'accès Supabase ordinaire —
 * même signature, mêmes claims qu'une session web, plus `client_id`.
 *
 * Ce jeton est réutilisé tel quel comme `Bearer` vers PostgREST : la RLS et
 * les RPC (`auth.uid()`) s'appliquent sans aucune règle propre au MCP. Un agent
 * ne peut donc rien faire que l'utilisateur ne puisse faire dans l'app.
 */

/** Émetteur attendu : le serveur Auth du projet Supabase. */
export function authServerUrl(): string {
  return `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`
}

/**
 * Ce qu'un tool sait de l'appelant une fois le jeton vérifié.
 *
 * Deux façons de se connecter, un seul serveur :
 *  - **OAuth** (recommandé) : le client MCP obtient un vrai jeton Supabase ;
 *    l'appelant est connu ici, et tous les tools sont ouverts ;
 *  - **jeton personnel** `omk_…`, créé dans « Mon compte » pour les clients
 *    qui ne gèrent pas OAuth : il n'est résolu qu'en base, par les RPC
 *    `mcp_*` (migration `ai_access_mcp`), et n'ouvre que les tools qui
 *    passent par elles — catalogue et listes.
 */
export type McpCaller =
  | { mode: 'oauth'; userId: string; isAnonymous: boolean; clientId: string }
  | { mode: 'token'; token: string }

/** Forme d'un jeton personnel ; sa validité, elle, se vérifie en base. */
export const PERSONAL_TOKEN_PATTERN = /^omk_[0-9a-f]{48}$/

/** Identifiant client affiché pour un appel par jeton personnel. */
export const PERSONAL_TOKEN_CLIENT_ID = 'onmangekoi-personal-token'

type Claims = Record<string, unknown>

/**
 * Vérifie un jeton présenté au serveur MCP. Renvoie `undefined` pour tout
 * jeton invalide : `withMcpAuth` répond alors 401 avec le lien vers les
 * métadonnées de ressource protégée, ce qui déclenche le parcours OAuth.
 *
 * - `getClaims` vérifie la signature via les clés publiques du projet (JWKS)
 *   et l'expiration. **Clés asymétriques requises** : avec une clé HS256,
 *   `getClaims` retombe sur `/auth/v1/user`, que Supabase Auth refuse aux
 *   jetons OAuth (voir docs/mcp.md).
 * - L'émetteur doit être ce projet, le rôle `authenticated`.
 * - `client_id` doit être présent : seul un jeton délivré à un client OAuth
 *   ouvre le MCP. Un jeton de session web volé dans un cookie ne suffit pas.
 */
export async function verifyMcpToken(
  _request: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined

  // Jeton personnel : sa forme suffit ici. La base le résout (empreinte
  // SHA-256) à chaque appel de tool et refuse un jeton inventé ou révoqué
  // avec `omk:invalid_api_token`, que l'IA lit et transmet.
  if (PERSONAL_TOKEN_PATTERN.test(bearerToken)) {
    const caller: McpCaller = { mode: 'token', token: bearerToken }
    return { token: bearerToken, clientId: PERSONAL_TOKEN_CLIENT_ID, scopes: [], extra: { caller } }
  }

  let claims: Claims | undefined
  try {
    const { data, error } = await createPublicClient().auth.getClaims(bearerToken)
    if (error || !data?.claims) return undefined
    claims = data.claims as Claims
  } catch {
    return undefined
  }

  return authInfoFromClaims(bearerToken, claims)
}

/** Partie pure de la vérification, testée unitairement. */
export function authInfoFromClaims(token: string, claims: Claims): AuthInfo | undefined {
  const sub = typeof claims.sub === 'string' ? claims.sub : null
  const clientId = typeof claims.client_id === 'string' ? claims.client_id : null
  const exp = typeof claims.exp === 'number' ? claims.exp : undefined

  if (!sub || !clientId) return undefined
  if (claims.iss !== authServerUrl()) return undefined
  if (claims.role !== 'authenticated') return undefined

  const caller: McpCaller = {
    mode: 'oauth',
    userId: sub,
    isAnonymous: claims.is_anonymous === true,
    clientId,
  }

  return {
    token,
    clientId,
    scopes: typeof claims.scope === 'string' ? claims.scope.split(' ').filter(Boolean) : [],
    expiresAt: exp,
    extra: { caller },
  }
}

/** L'appelant d'un tool, lu dans l'`AuthInfo` posé par `withMcpAuth`. */
export function callerFromAuthInfo(authInfo: AuthInfo | undefined): McpCaller | null {
  const caller = authInfo?.extra?.caller as McpCaller | undefined
  if (caller?.mode === 'oauth' && caller.userId) return caller
  if (caller?.mode === 'token' && caller.token) return caller
  return null
}

/**
 * Recopie un jeton personnel passé en `?key=` (voir `src/lib/mcp/endpoint.ts`) dans l'en-tête `Authorization`,
 * seul endroit où `withMcpAuth` le cherche. Un en-tête déjà présent l'emporte ;
 * un jeton OAuth ne voyage jamais dans l'URL.
 */
export function withKeyParamAsBearer(request: Request): Request {
  if (request.headers.get('authorization')) return request
  const key = new URL(request.url).searchParams.get(MCP_KEY_PARAM)?.trim()
  if (!key || !PERSONAL_TOKEN_PATTERN.test(key)) return request
  const headers = new Headers(request.headers)
  headers.set('authorization', `Bearer ${key}`)
  return new Request(request, { headers })
}
