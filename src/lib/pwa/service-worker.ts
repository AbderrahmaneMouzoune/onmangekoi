/**
 * Source du service worker, servie sur `/sw.js` par `src/app/sw.js/route.ts`.
 *
 * Un script maison plutôt que Serwist : Serwist s'appuie sur un plugin
 * webpack, alors que le build tourne sous Turbopack, et le besoin tient en
 * une centaine de lignes. Le script est généré au build, une fois pour
 * toutes, avec l'identifiant du build dans le nom de ses caches :
 *
 *  1. chaque déploiement produit un `/sw.js` différent d'au moins un octet,
 *     ce qui suffit au navigateur pour installer la nouvelle version ;
 *  2. celle-ci prend la main sans attendre (`skipWaiting` + `clients.claim`)
 *     et efface à l'activation tous les caches `omk-*` d'un autre build.
 *
 * Ce qu'il cache, et rien d'autre :
 *  - l'app shell hors ligne : la page `/offline`, ses scripts, sa feuille de
 *    style, ses polices, le manifest et les icônes — précachés à l'installation ;
 *  - au fil de l'eau, les fichiers immuables de `/_next/static/` (cache-first).
 *
 * Les pages ne sont jamais mises en cache : elles portent le pseudo, les
 * sessions, les listes. Une navigation va au réseau et, s'il ne répond pas,
 * reçoit la page hors ligne. Supabase, `/api/`, `/auth/`, les Server Actions
 * et les charges RSC passent sans être touchés (voir `sw-routing.ts`).
 *
 * Le script est découpé en sections numérotées ; les notifications push
 * (#7) viendront s'ajouter dans la dernière, sans toucher au reste.
 */

import { staticAssetsIn, swStrategy } from '@/lib/pwa/sw-routing'

/** Préfixe de tous les caches de l'app : ce qui ne le porte pas n'est jamais effacé. */
export const CACHE_PREFIX = 'omk-'

export interface ServiceWorkerConfig {
  /** Identifiant du build : nomme les caches, donc les invalide au déploiement suivant. */
  version: string
  /** Origine de Supabase, jamais cachée. */
  supabaseOrigin: string
  /** Page servie quand une navigation échoue. */
  offlineUrl: string
  /** Ressources précachées à l'installation, en plus de la page hors ligne. */
  precacheUrls: readonly string[]
}

/** Noms des caches d'un build. */
export function cacheNames(version: string): { precache: string; runtime: string } {
  return {
    precache: `${CACHE_PREFIX}${version}-precache`,
    runtime: `${CACHE_PREFIX}${version}-static`,
  }
}

export function buildServiceWorker(config: ServiceWorkerConfig): string {
  const { precache, runtime } = cacheNames(config.version)
  const json = (value: unknown) => JSON.stringify(value)

  return `/* onmangekoi — service worker, build ${config.version}.
 * Généré par src/lib/pwa/service-worker.ts : ne pas modifier à la main. */
'use strict'

// ── 1. Configuration ─────────────────────────────────────────────
const VERSION = ${json(config.version)}
const CACHE_PREFIX = ${json(CACHE_PREFIX)}
const PRECACHE = ${json(precache)}
const RUNTIME = ${json(runtime)}
const OFFLINE_URL = ${json(config.offlineUrl)}
const PRECACHE_URLS = ${json([config.offlineUrl, ...config.precacheUrls])}
const SUPABASE_ORIGIN = ${json(config.supabaseOrigin)}

// ── 2. Règles de routage (src/lib/pwa/sw-routing.ts) ─────────────
const swStrategy = (${swStrategy.toString()})
const staticAssetsIn = (${staticAssetsIn.toString()})

// ── 3. Cycle de vie : précache de l'app shell, purge des anciens builds ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE)
      // \`reload\` : on veut la version du serveur, pas celle du cache HTTP.
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })))
      // Les sous-ressources de la page hors ligne, lues dans son HTML. Au
      // mieux : une police manquante ne doit pas empêcher l'installation.
      const offline = await cache.match(OFFLINE_URL)
      const html = offline ? await offline.text() : ''
      await Promise.allSettled(staticAssetsIn(html).map((url) => cache.add(url)))
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const current = CACHE_PREFIX + VERSION + '-'
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !key.startsWith(current))
          .map((key) => caches.delete(key))
      )
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable()
      }
      await self.clients.claim()
    })()
  )
})

// ── 4. Requêtes ──────────────────────────────────────────────────
async function navigate(event) {
  try {
    const preloaded = await event.preloadResponse
    if (preloaded) return preloaded
    return await fetch(event.request)
  } catch (error) {
    const offline = await caches.match(OFFLINE_URL)
    if (offline) return offline
    throw error
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') {
    const copy = response.clone()
    caches
      .open(RUNTIME)
      .then((cache) => cache.put(request, copy))
      .catch(() => undefined)
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const strategy = swStrategy({
    method: request.method,
    url: request.url,
    mode: request.mode,
    origin: self.location.origin,
    supabaseOrigin: SUPABASE_ORIGIN,
    isServerAction: request.headers.has('Next-Action'),
    isRsc: request.headers.has('RSC'),
  })
  if (strategy === 'navigate') event.respondWith(navigate(event))
  else if (strategy === 'cache-first') event.respondWith(cacheFirst(request))
  // 'network-only' : pas de respondWith, le navigateur fait comme sans nous.
})

// ── 5. Notifications push (#7) ───────────────────────────────────
// Les gestionnaires \`push\` et \`notificationclick\` viendront ici. La
// souscription passe par la registration exposée côté page
// (\`getServiceWorkerRegistration\`, src/lib/pwa/registration.ts).
`
}
