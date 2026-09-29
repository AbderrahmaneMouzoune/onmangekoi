/**
 * Enregistrement du service worker, côté navigateur.
 *
 * Uniquement sur un build de production : en `next dev`, les fichiers de
 * `/_next/static/` changent de contenu sans changer de nom, et un cache
 * cache-first y servirait du code périmé. Pire, un service worker laissé par
 * un `next start` sur le même port survivrait au passage en dev — on le
 * désinscrit donc explicitement.
 */

import { router } from '@/config/router.config'

/** Le service worker est-il voulu sur ce build ? */
export function isServiceWorkerEnabled(): boolean {
  return process.env.NODE_ENV === 'production'
}

function isSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * Enregistre `/sw.js` (ou désinscrit tout service worker hors production).
 * Silencieux en cas d'échec : l'app fonctionne sans, simplement sans hors
 * ligne ni installation.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isSupported()) return null

  try {
    if (!isServiceWorkerEnabled()) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
      return null
    }

    return await navigator.serviceWorker.register(router.serviceWorker(), {
      scope: router.home(),
      // Le script est toujours revalidé auprès du serveur : une mise à jour
      // de l'app est vue à la prochaine navigation, pas 24 h plus tard.
      updateViaCache: 'none',
    })
  } catch {
    return null
  }
}

/**
 * La registration active, pour qui a besoin du service worker lui-même —
 * les notifications push (#7) y souscrivent via `registration.pushManager`.
 *
 * `navigator.serviceWorker.ready` ne se résout jamais sans service worker
 * (dev, navigateur qui refuse, échec d'installation) : on abandonne au bout
 * de `timeoutMs` et on rend `null`.
 */
export async function getServiceWorkerRegistration(
  timeoutMs = 10_000
): Promise<ServiceWorkerRegistration | null> {
  if (!isSupported() || !isServiceWorkerEnabled()) return null

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })

  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout])
  } finally {
    clearTimeout(timer)
  }
}
