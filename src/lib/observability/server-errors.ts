/**
 * Remontée des erreurs serveur vers l'error tracking PostHog.
 *
 * Branché sur `onRequestError` (`src/instrumentation.ts`) : Next l'appelle
 * pour toute erreur levée pendant un rendu, une route API, une Server Action
 * ou le proxy. Côté navigateur, ces erreurs n'apparaissent que sous forme de
 * `digest` opaque : sans ce relais, elles seraient invisibles.
 *
 * Ce qui part, et ce qui ne part pas :
 *  - aucun identifiant de personne : l'événement est anonyme et ne crée pas de
 *    profil (`$process_person_profile: false`) — il n'y a donc rien à
 *    rattacher à un consentement ;
 *  - le motif de route (`/[locale]/sessions/[code]`), jamais l'URL réelle, et
 *    le chemin masqué (`$pathname`), comme pour les événements produit ;
 *  - le type, le message et la pile de l'erreur.
 *
 * Inerte sans `NEXT_PUBLIC_POSTHOG_KEY`, comme le reste de la mesure.
 */

import { PostHog } from 'posthog-node'

import { maskPathname } from '@/lib/analytics/sanitize'

import type { Instrumentation } from 'next'

let client: PostHog | null = null

function getClient(key: string): PostHog {
  client ??= new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
    // Fonctions serverless : chaque erreur part tout de suite, rien n'attend
    // un lot qui ne serait jamais envoyé.
    flushAt: 1,
    flushInterval: 0,
    disableGeoip: true,
  })
  return client
}

type RequestErrorArgs = Parameters<Instrumentation.onRequestError>

export async function captureServerError(...[error, request, context]: RequestErrorArgs) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return

  try {
    await getClient(key).captureExceptionImmediate(error, undefined, {
      $process_person_profile: false,
      $pathname: maskPathname(request.path.split(/[?#]/)[0] ?? '/'),
      runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      method: request.method,
      route: context.routePath,
      route_type: context.routeType,
      render_source: context.renderSource,
      router_kind: context.routerKind,
    })
  } catch {
    // La remontée d'erreur ne doit jamais en provoquer une autre.
  }
}
