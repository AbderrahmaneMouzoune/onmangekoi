/**
 * Règles de routage du service worker, en fonctions pures.
 *
 * Elles vivent ici pour être testées, mais s'exécutent dans le service
 * worker : `service-worker.ts` recopie leur source (`fn.toString()`) dans le
 * script servi sur `/sw.js`. D'où une contrainte stricte — **chaque fonction
 * se suffit à elle-même** : aucune référence à une autre fonction, constante
 * ou import du module, puisque seul son corps voyage. Un test le vérifie en
 * les réévaluant hors de ce module.
 */

/** Ce que le service worker fait d'une requête. */
export type SwStrategy =
  /** Il s'efface : le navigateur fait comme s'il n'existait pas. Rien n'est mis en cache. */
  | 'network-only'
  /** Navigation : le réseau, et la page hors ligne s'il ne répond pas. */
  | 'navigate'
  /** Fichier immuable (nom haché) : le cache d'abord, le réseau pour le remplir. */
  | 'cache-first'

/** Ce qu'il faut savoir d'une requête pour choisir, sans dépendre de l'objet `Request`. */
export interface SwRequestInfo {
  method: string
  url: string
  /** `Request.mode` : `navigate` pour un chargement de page. */
  mode: string
  /** Origine de l'app (`self.location.origin`). */
  origin: string
  /** Origine de Supabase (`NEXT_PUBLIC_SUPABASE_URL`). */
  supabaseOrigin: string
  /** En-tête `Next-Action` : une Server Action. */
  isServerAction: boolean
  /** En-tête `RSC` : une charge utile React Server Components (navigation client, préchargement). */
  isRsc: boolean
}

/**
 * Stratégie pour une requête. L'ordre compte : tout ce qui touche aux
 * données — Supabase, API, authentification, Server Actions, charges RSC —
 * sort avant toute règle de cache. Aucune réponse personnelle ne doit
 * pouvoir se retrouver servie depuis le cache, à cette personne ou à la
 * suivante sur le même appareil.
 */
export function swStrategy(request: SwRequestInfo): SwStrategy {
  if (request.method !== 'GET') return 'network-only'

  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return 'network-only'
  }

  if (url.origin === request.supabaseOrigin) return 'network-only'
  // PostHog, tuiles de carte, photos Google : rien d'étranger n'est caché.
  if (url.origin !== request.origin) return 'network-only'
  if (request.isServerAction || request.isRsc || url.searchParams.has('_rsc')) {
    return 'network-only'
  }

  const path = url.pathname
  if (path === '/sw.js' || path.startsWith('/api/') || path.startsWith('/auth/')) {
    return 'network-only'
  }

  if (request.mode === 'navigate') return 'navigate'

  // Scripts, feuilles de style et polices de `next/font` : noms hachés,
  // contenu immuable pour un build donné.
  if (path.startsWith('/_next/static/')) return 'cache-first'
  if (/\.(?:woff2?|ttf|otf)$/i.test(path)) return 'cache-first'

  return 'network-only'
}

/**
 * Sous-ressources à précacher avec la page hors ligne : ses scripts, sa
 * feuille de style et les polices qu'elle précharge, lus dans son HTML.
 * Seuls les fichiers immuables de `/_next/static/` sont retenus.
 */
export function staticAssetsIn(html: string): string[] {
  const found = new Set<string>()
  const pattern = /\/_next\/static\/[^"'\s)\\<>]+?\.(?:js|css|woff2?)(?=["'\s)\\<>?#]|$)/g
  for (const match of html.match(pattern) ?? []) found.add(match)
  return Array.from(found).sort()
}
