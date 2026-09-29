import { router } from '@/config/router.config'
import { env } from '@/env'
import { BUILD_ID } from '@/lib/pwa/build-id'
import { PWA_ICONS } from '@/lib/pwa/icons'
import { buildServiceWorker } from '@/lib/pwa/service-worker'

/** L'icône 192 ordinaire : la taille qu'Android et les bureaux attendent d'une notification. */
const NOTIFICATION_ICON =
  PWA_ICONS.find((icon) => icon.size === 192 && icon.purpose === 'any')?.src ?? '/icon'

/**
 * Le service worker (issue #11). Rien n'y dépend de la requête : la réponse
 * est prérendue au build, avec l'identifiant de ce build dans le nom des
 * caches — c'est ce qui fait qu'un déploiement invalide le cache du précédent.
 *
 * `no-cache` : le script est revalidé à chaque vérification de mise à jour
 * plutôt que servi périmé depuis un cache HTTP. L'enregistrement le demande
 * aussi de son côté (`updateViaCache: 'none'`, voir `registration.ts`).
 */
export function GET() {
  const source = buildServiceWorker({
    version: BUILD_ID,
    supabaseOrigin: new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin,
    offlineUrl: router.offline(),
    precacheUrls: ['/manifest.webmanifest', ...PWA_ICONS.map((icon) => icon.src)],
    notificationIcon: NOTIFICATION_ICON,
  })

  return new Response(source, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': router.home(),
    },
  })
}
