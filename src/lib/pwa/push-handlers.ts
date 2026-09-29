/**
 * Notifications push, côté service worker (issue #7), en fonctions pures.
 *
 * Même contrat que `sw-routing.ts` : elles vivent ici pour être testées, mais
 * `service-worker.ts` recopie leur source (`fn.toString()`) dans `/sw.js`.
 * **Chaque fonction se suffit à elle-même** — aucune référence à une autre
 * fonction, constante ou import du module.
 */

/** Ce que le service worker affiche, lu dans la charge utile d'un `push`. */
export interface PushNotificationContent {
  title: string
  body: string
  /** Chemin interne, déjà vérifié : jamais une autre origine. */
  url: string
  tag: string
  /** Langue du texte (`fr`, `en`…), pour la synthèse vocale. `fr` à défaut. */
  lang: string
}

/**
 * Lit la charge utile envoyée par `/api/push/dispatch` (voir
 * `domain/push.ts`). Tout ce qui ne lui ressemble pas est écarté — `null`, le
 * service worker n'affiche rien. L'adresse est ramenée à un chemin de l'app :
 * une URL d'une autre origine, ou qui n'en est pas une, est refusée.
 */
export function readPushMessage(data: unknown, origin: string): PushNotificationContent | null {
  if (typeof data !== 'object' || data === null) return null
  const { title, body, url, tag, lang } = data as Record<string, unknown>
  if (typeof title !== 'string' || title.length === 0) return null
  if (typeof body !== 'string' || typeof tag !== 'string' || typeof url !== 'string') return null

  let target: URL
  try {
    target = new URL(url, origin)
  } catch {
    return null
  }
  if (target.origin !== origin || !url.startsWith('/') || url.startsWith('//')) return null

  return {
    title: title.slice(0, 120),
    body: body.slice(0, 300),
    url: target.pathname + target.search + target.hash,
    tag: tag.slice(0, 120),
    // Un code de langue court, ou le français : c'était la seule langue des
    // notifications avant que la charge utile ne la porte.
    lang: typeof lang === 'string' && /^[a-z]{2}$/.test(lang) ? lang : 'fr',
  }
}

/**
 * L'adresse à ouvrir au clic, relue dans `notification.data`. Elle a été
 * vérifiée à l'affichage, mais rien ne coûte de la revérifier : un chemin de
 * l'app, sinon l'accueil.
 */
export function notificationTarget(url: unknown, origin: string): string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return '/'
  try {
    const target = new URL(url, origin)
    if (target.origin !== origin) return '/'
    return target.pathname + target.search + target.hash
  } catch {
    return '/'
  }
}

/** Que faire d'une fenêtre déjà ouverte au clic sur une notification. */
export interface WindowChoice {
  /** Rang de la fenêtre dans la liste passée. */
  index: number
  /** Faut-il la faire changer de page, ou seulement lui donner le focus ? */
  navigate: boolean
}

/**
 * Choisit la fenêtre à réutiliser plutôt que d'en ouvrir une nouvelle :
 *  1. une fenêtre déjà sur l'adresse visée — on lui donne le focus ;
 *  2. sinon une fenêtre sur la même session (la salle de vote quand on vise
 *     le classement, par exemple) — on l'y emmène ;
 *  3. sinon aucune : `clients.openWindow`.
 */
export function pickWindow(
  target: string,
  windowUrls: readonly string[],
  origin: string
): WindowChoice | null {
  const pathOf = (url: string): string | null => {
    try {
      const parsed = new URL(url, origin)
      return parsed.origin === origin ? parsed.pathname.replace(/\/+$/, '') || '/' : null
    } catch {
      return null
    }
  }

  const targetPath = pathOf(target)
  if (targetPath === null) return null
  const paths = windowUrls.map(pathOf)

  const exact = paths.indexOf(targetPath)
  if (exact !== -1) return { index: exact, navigate: false }

  const match = /^\/sessions\/[^/]+/.exec(targetPath)
  if (match === null) return null
  const session = match[0]
  const sameSession = paths.findIndex(
    (path) => path !== null && (path === session || path.startsWith(`${session}/`))
  )
  return sameSession === -1 ? null : { index: sameSession, navigate: true }
}
