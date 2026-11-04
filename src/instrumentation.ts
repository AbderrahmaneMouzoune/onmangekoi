/**
 * Observabilité serveur : traces OpenTelemetry et erreurs, vers PostHog.
 *
 * Inerte sans `NEXT_PUBLIC_POSTHOG_KEY` — donc en local, en CI et sur les
 * previews, où la clé n'est pas définie (voir docs/analytics.md).
 *
 *  - `register` : Next émet ses propres spans (requête, rendu, Server Action,
 *    `fetch` sortants vers Supabase et Google). `@vercel/otel` les collecte et
 *    les exporte en OTLP vers le tracing distribué de PostHog, après masquage
 *    des URLs (`SanitizingSpanExporter`).
 *  - `onRequestError` : les erreurs serveur partent dans l'error tracking.
 */

import type { Instrumentation } from 'next'

/** Nom du service dans l'écran Tracing de PostHog. */
const SERVICE_NAME = 'onmangekoi-web'

export async function register() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com'
  const [{ registerOTel, OTLPHttpProtoTraceExporter }, { SanitizingSpanExporter }] =
    await Promise.all([import('@vercel/otel'), import('@/lib/observability/span-sanitizer')])

  registerOTel({
    serviceName: SERVICE_NAME,
    traceExporter: new SanitizingSpanExporter(
      new OTLPHttpProtoTraceExporter({
        url: `${host}/i/v1/traces`,
        headers: { Authorization: `Bearer ${key}` },
      })
    ),
  })
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  // posthog-node vise Node : le runtime edge (proxy) n'a que ses traces.
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return

  const { captureServerError } = await import('@/lib/observability/server-errors')
  await captureServerError(...args)
}
