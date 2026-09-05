/**
 * Chargement et pilotage de PostHog, côté navigateur uniquement.
 *
 * Deux interrupteurs, tous deux bloquants :
 *  1. `NEXT_PUBLIC_POSTHOG_KEY` — absente, le module entier est inerte (tests,
 *     CI, previews, développement local) ;
 *  2. le consentement — tant qu'il n'est pas donné, le script n'est même pas
 *     téléchargé : aucun cookie, aucun identifiant, aucune requête.
 *
 * Le SDK est importé dynamiquement pour rester hors du bundle initial : un
 * visiteur qui refuse ne paie jamais son poids.
 */

import { env } from '@/env'
import { sanitizeProperties } from '@/lib/analytics/sanitize'

import type { AnalyticsEvent, AnalyticsEventMap } from '@/lib/analytics/events'
import type { PostHog } from 'posthog-js'

type QueuedCapture = { event: string; properties?: Record<string, unknown> }

let client: PostHog | null = null
let loading: Promise<PostHog | null> | null = null
/** Événements survenus pendant le chargement du SDK, rejoués juste après. */
let queue: QueuedCapture[] = []
let identifiedAs: string | null = null

/** La mesure est-elle possible sur ce déploiement ? */
export function isAnalyticsConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_POSTHOG_KEY)
}

/**
 * Charge et initialise PostHog. Idempotent : les appels suivants réutilisent
 * la même promesse. À n'appeler qu'une fois le consentement obtenu.
 */
export function startAnalytics(): Promise<PostHog | null> {
  const key = env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key || typeof window === 'undefined') return Promise.resolve(null)
  if (loading) return loading

  loading = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
        // Profils uniquement pour les personnes identifiées (issue #18).
        person_profiles: 'identified_only',
        // Les vues sont émises à la main, sur des routes masquées.
        capture_pageview: false,
        capture_pageleave: false,
        // L'autocapture enverrait le texte des éléments cliqués — donc des pseudos.
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
        capture_performance: false,
        mask_personal_data_properties: true,
        cross_subdomain_cookie: false,
        // Dernier filet : aucune URL ne part sans passer par le masquage.
        before_send: (event) =>
          event ? { ...event, properties: sanitizeProperties(event.properties) } : event,
      })

      client = posthog
      if (identifiedAs) posthog.identify(identifiedAs)
      for (const { event, properties } of queue) posthog.capture(event, properties)
      queue = []
      return posthog
    })
    .catch(() => {
      // Script bloqué (réseau, extension) : l'app continue sans mesure.
      loading = null
      queue = []
      return null
    })

  return loading
}

/**
 * Coupe la mesure et efface ce que PostHog a stocké (cookies, identifiant).
 * Appelé au retrait du consentement.
 */
export function stopAnalytics(): void {
  queue = []
  identifiedAs = null
  if (!client) return
  client.opt_out_capturing()
  client.reset()
}

function enqueue(event: string, properties?: Record<string, unknown>): void {
  if (client) {
    client.capture(event, properties)
    return
  }
  // Le SDK charge encore : on garde l'événement, sans dépasser un seuil absurde.
  if (loading && queue.length < 20) queue.push({ event, properties })
}

/** Émet un événement produit. Sans mesure active, l'appel ne fait rien. */
export function captureEvent<E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEventMap[E]
): void {
  enqueue(event, properties)
}

/** Vue de page, sur une route masquée (jamais l'URL réelle). */
export function capturePageview(): void {
  enqueue('$pageview')
}

/**
 * Rattache les événements à un identifiant opaque (l'UUID du profil Supabase),
 * ce qui rend la rétention hebdomadaire mesurable. `null` à la déconnexion.
 */
export function identifyProfile(profileId: string | null): void {
  if (profileId === identifiedAs) return

  if (!profileId) {
    identifiedAs = null
    client?.reset()
    return
  }

  identifiedAs = profileId
  client?.identify(profileId)
}
