/**
 * Masquage des traces serveur avant leur envoi à PostHog.
 *
 * Les spans OpenTelemetry décrivent chaque requête par son URL réelle :
 * `GET /sessions/7K3M9P`, `http.target`, `url.full`… et les appels sortants
 * (Supabase, Google Places) par la leur, query string comprise
 * (`?code=eq.7K3M9P`, `?key=…`). Or le code d'une session suffit à la
 * rejoindre. On applique donc aux traces le même masquage qu'aux événements
 * produit (`src/lib/analytics/sanitize.ts`) : motif de route à la place des
 * segments identifiants, query string et fragment supprimés.
 */

import { sanitizeUrl } from '@/lib/analytics/sanitize'

import type { Attributes, AttributeValue } from '@opentelemetry/api'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'

/**
 * Attributs porteurs d'une URL, d'un chemin ou d'une requête, quelle que soit
 * la convention sémantique (`http.url`, `url.full`, `http.target`,
 * `url.path`, `url.query`, `next.page`…).
 */
const URL_ATTRIBUTE = /(?:url|uri|target|path|query|page|referer|referrer|href)$/i

/** Attributs qui ne doivent jamais partir, même masqués. */
const DROPPED_ATTRIBUTE = /(?:^|\.)(?:query|cookie|authorization)$|\.header\./i

/** Une valeur qui commence comme une URL ou un chemin absolu. */
const URL_LIKE_VALUE = /^(?:https?:\/\/|\/)/i

/** Un jeton qui ressemble à un chemin ou à une URL, dans un nom de span. */
const URL_TOKEN = /(?:https?:\/\/|\/)\S*/g

/** `GET /sessions/7K3M9P?x=1` → `GET /sessions/[code]`. */
export function sanitizeSpanName(name: string): string {
  return name.replace(URL_TOKEN, (token) => sanitizeUrl(token))
}

function sanitizeString(key: string, value: string): string {
  return URL_ATTRIBUTE.test(key) || URL_LIKE_VALUE.test(value) ? sanitizeUrl(value) : value
}

function sanitizeAttributeValue(
  key: string,
  value: AttributeValue | undefined
): AttributeValue | undefined {
  if (typeof value === 'string') return sanitizeString(key, value)
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'string' ? sanitizeString(key, item) : item
    ) as AttributeValue
  }
  return value
}

/**
 * Copie des attributs : en-têtes et query strings retirés, URLs masquées —
 * celles des attributs connus (`http.target`…) comme toute valeur qui
 * ressemble à une URL (`url.full`, ou une convention qu'on ne connaît pas
 * encore).
 */
export function sanitizeSpanAttributes(attributes: Attributes): Attributes {
  const result: Attributes = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (DROPPED_ATTRIBUTE.test(key)) continue
    result[key] = sanitizeAttributeValue(key, value)
  }
  return result
}

/**
 * Vue masquée d'un span terminé. Le span d'origine n'est pas modifié : on en
 * dérive un objet qui hérite de lui et redéfinit seulement le nom, les
 * attributs et ceux de ses événements (une exception y porte souvent l'URL).
 */
export function sanitizeSpan(span: ReadableSpan): ReadableSpan {
  return Object.create(span, {
    name: { value: sanitizeSpanName(span.name), enumerable: true },
    attributes: { value: sanitizeSpanAttributes(span.attributes), enumerable: true },
    events: {
      value: span.events.map((event) => ({
        ...event,
        attributes: event.attributes ? sanitizeSpanAttributes(event.attributes) : undefined,
      })),
      enumerable: true,
    },
  }) as ReadableSpan
}

/** Enveloppe un exporteur : rien ne sort sans être passé par `sanitizeSpan`. */
export class SanitizingSpanExporter implements SpanExporter {
  constructor(private readonly inner: SpanExporter) {}

  export(spans: ReadableSpan[], resultCallback: Parameters<SpanExporter['export']>[1]): void {
    this.inner.export(spans.map(sanitizeSpan), resultCallback)
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown()
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve()
  }
}
