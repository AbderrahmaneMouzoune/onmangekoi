import { z } from 'zod'

import type { OAuthAuthorizationDetails, OAuthGrant, OAuthRedirect } from '@supabase/supabase-js'

/**
 * Logique pure de l'interface OAuth (écran de consentement, apps connectées) :
 * lecture des paramètres, tri et mise en forme de ce que renvoie le serveur
 * d'autorisation Supabase. Sans Next ni réseau, donc testable telle quelle.
 */

/**
 * Identifiant opaque généré par Supabase Auth. On n'en connaît pas le format
 * exact (il a changé entre versions) : on borne seulement sa taille, pour ne
 * pas relayer n'importe quoi au serveur Auth.
 */
export const AUTHORIZATION_ID_MAX = 256

export const authorizationIdSchema = z.string().trim().min(1).max(AUTHORIZATION_ID_MAX)

/**
 * Décision envoyée par le formulaire de consentement. Le bouton cliqué porte
 * `name="decision"` : la valeur arrive dans le FormData, sans booléen à
 * convertir (pas de `z.coerce.boolean`, qui lirait `'false'` comme vrai).
 */
export const consentDecisionSchema = z.object({
  authorization_id: authorizationIdSchema,
  decision: z.enum(['approve', 'deny']),
})

export type ConsentDecision = z.infer<typeof consentDecisionSchema>['decision']

/** Identifiant d'un client OAuth, pour la déconnexion d'une app. */
export const oauthClientIdSchema = z.string().trim().min(1).max(AUTHORIZATION_ID_MAX)

/** `?authorization_id=` tel que Next le livre : absent, unique ou répété. */
export function readAuthorizationId(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  const parsed = authorizationIdSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * `getAuthorizationDetails` renvoie soit les détails à afficher, soit
 * directement l'URL de retour quand la personne a déjà consenti à ces accès.
 */
export function isConsentRedirect(
  data: OAuthAuthorizationDetails | OAuthRedirect
): data is OAuthRedirect {
  return !('authorization_id' in data) && typeof data.redirect_url === 'string'
}

/**
 * URL déclarée par le client OAuth (site, logo). L'enregistrement dynamique
 * (DCR) laisse n'importe qui la choisir : on n'accepte que `https:` (et
 * `http:` pour un client local), jamais `javascript:` ni `data:`.
 */
export function safeHttpUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

/**
 * Destination du retour après la décision, à montrer avant de consentir.
 * Nom, site et logo sont déclarés librement par le client (DCR) : une app
 * malveillante peut s'appeler « Claude ». L'URI de retour, elle, est celle où
 * partira le code d'autorisation — c'est l'indice le plus fiable contre
 * l'hameçonnage. Hôte pour une URL web, schéma (+ hôte) pour une app native
 * (`cursor://…`), `null` si illisible.
 */
export function redirectTarget(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.host || null
    return url.host ? `${url.protocol}//${url.host}` : url.protocol
  } catch {
    return null
  }
}

/** Une app autorisée, telle que la section du compte l'affiche. */
export interface ConnectedApp {
  clientId: string
  /** `null` quand le client n'a pas déclaré de nom : la page affiche un repli traduit. */
  name: string | null
  /** Hôte du site déclaré, pour reconnaître l'app (`claude.ai`), ou `null`. */
  host: string | null
  scopes: string[]
  grantedAt: string
}

export function toConnectedApp(grant: OAuthGrant): ConnectedApp {
  const name = grant.client.name?.trim()
  return {
    clientId: grant.client.id,
    name: name ? name : null,
    host: safeHttpUrl(grant.client.uri)?.host ?? null,
    scopes: [...new Set(grant.scopes)].filter(Boolean),
    grantedAt: grant.granted_at,
  }
}

/** Les apps connectées, la plus récemment autorisée en tête. */
export function toConnectedApps(grants: readonly OAuthGrant[]): ConnectedApp[] {
  return grants
    .map(toConnectedApp)
    .sort((a, b) => Date.parse(b.grantedAt) - Date.parse(a.grantedAt))
}
