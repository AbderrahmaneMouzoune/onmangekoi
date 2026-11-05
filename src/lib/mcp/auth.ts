import 'server-only'

import { createPublicClient } from '@/data-access/supabase/public'
import { env } from '@/env'

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

/** Ce qu'un tool sait de l'appelant une fois le jeton vérifié. */
export interface McpCaller {
  userId: string
  isAnonymous: boolean
  clientId: string
}

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
  return caller?.userId ? caller : null
}
