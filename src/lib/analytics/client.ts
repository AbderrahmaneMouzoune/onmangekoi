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
/** Ce que l'app sait de l'utilisateur courant. */
let profile: string | null = null
/** Ce que PostHog en sait déjà — les deux divergent le temps du chargement. */
let identified: string | null = null

/** La mesure est-elle possible sur ce déploiement ? */
export function isAnalyticsConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_POSTHOG_KEY)
}

function syncIdentity(): void {
  if (!client || identified === profile) return

  if (!profile) {
    client.reset()
    identified = null
    return
  }

  client.identify(profile)
  identified = profile
}

/**
 * Charge et initialise PostHog. Idempotent, y compris après un refus suivi
 * d'une acceptation dans la même visite. À n'appeler qu'une fois le
 * consentement obtenu.
 */
export function startAnalytics(): Promise<PostHog | null> {
  const key = env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key || typeof window === 'undefined') return Promise.resolve(null)

  if (client) {
    // Déjà chargé : on sort d'un refus (de cette visite ou d'une précédente,
    // PostHog gardant l'opt-out en stockage). `captureEventName: false` évite
    // un événement `$opt_in` qui n'apporte rien à l'entonnoir.
    client.opt_in_capturing({ captureEventName: false })
    syncIdentity()
    return Promise.resolve(client)
  }

  if (loading) return loading

  loading = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
        // Profils uniquement pour les personnes identifiées (issue #18).
        person_profiles: 'identified_only',
        // Une vue par changement d'historique — donc aussi en navigation
        // client. L'URL réelle ne part jamais : `before_send` la masque.
        capture_pageview: 'history_change',
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
      if (posthog.has_opted_out_capturing()) {
        posthog.opt_in_capturing({ captureEventName: false })
      }
      syncIdentity()
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
 * Appelé au retrait du consentement. L'identifiant connu de l'app est
 * conservé : il resservira si le consentement revient.
 */
export function stopAnalytics(): void {
  queue = []
  identified = null
  if (!client) return
  // `reset()` d'abord : il efface le stockage, opt-out compris.
  client.reset()
  client.opt_out_capturing()
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

/**
 * Rattache les événements à un identifiant opaque (l'UUID du profil Supabase),
 * ce qui rend la rétention hebdomadaire mesurable. `null` à la déconnexion.
 */
export function identifyProfile(profileId: string | null): void {
  profile = profileId
  syncIdentity()
}
